import { Client, Query, TablesDB } from 'node-appwrite'
import { createMicrocache } from '../../../core/server/utils/microcache'
import type { CommunityHostResolver } from '../../../core/server/utils/communityHost'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { canonicalHostFor } from '../../shared/customDomain'

/**
 * D5 — die Antwort auf den core-Vertrag `registerCommunityHostResolver`:
 * Ablage-Wert einer Benachrichtigung → Host der Community.
 *
 * Dieselbe Bauart wie `createTenantsTableResolver` und
 * `createFormerCommunityMembersResolver` nebenan: explizite Verbindungsdaten
 * (der Leser läuft im Runtime-Projekt, die Zuordnung liegt im Control Plane),
 * read-only-Key, eigener Cache.
 *
 * NACHGESCHLAGEN WIRD `tenantId`, NICHT `$id`. Der Wert in
 * `notifications.communityId` ist der Zeilen-Scope des Pools (`t-…`, gestempelt
 * von `scopeRowFor`) — E8-3 hat die SPALTE auf `communityId` umbenannt, den
 * WERT nicht. Ein Nachschlagen über `$id` liefe still ins Leere, weil der
 * Vertrag fail-soft ist und ein fehlender Host wie „nicht auflösbar" aussieht.
 * Genagelt in packages/control/tests/communityHostResolver.test.ts.
 *
 * KEIN eigener Index: `communities` hat eine Zeile je Kunde und `uq_host`/
 * `idx_status`; ein Gleichheitsfilter auf `tenantId` läuft dort ohne Index
 * (gegen die echte Instanz nachgemessen). Sollte die Tabelle je vierstellig
 * werden, ist ein `idx_tenant_id` die richtige Antwort — nicht ein zweiter
 * Cache.
 *
 * NEGATIV wird ebenfalls gecacht (`null` = kein aktiver Host): sonst fragt
 * JEDE Digest-Mail mit einer Bestandszeile oder einer gelöschten Community das
 * Control Plane erneut. Fehler cachen nie.
 *
 * `status !== 'active'` zählt bewusst als „nicht auflösbar": ein abgeschalteter
 * Host antwortet 404 (der Tenant-Resolver liefert dort `null`), ein Link
 * dorthin wäre eine Sackgasse. Der Empfänger bekommt dann die App-Basis — auch
 * nicht perfekt, aber wenigstens eine Seite, die es gibt.
 *
 * `suspension === 'abuse'` zählt AUS DEMSELBEN GRUND als nicht auflösbar (M13,
 * Audit-Befund): eine wegen Missbrauchs gesperrte Community ist vollständig
 * offline — der Tenant-Resolver liefert dort ebenfalls `null`, der Host
 * antwortet 404. Die Prüfung fehlte, weil die Sperre NACH diesem Resolver
 * gebaut wurde und `status` damals der einzige Aus-Schalter war.
 *
 * `suspension === 'billing'` wird bewusst NICHT gefiltert: dieser Host lebt, er
 * ist nur nur-lesend. Der Link führt genau dorthin, wo der Empfänger hinsoll —
 * einschließlich des Hinweises, warum gerade nichts geschrieben werden kann.
 *
 * AUFGELÖST WIRD SEIT control-035 DIE KANONISCHE ADRESSE, nicht mehr blind
 * `host`: hat die Community eine AKTIVE eigene Domain, verlinkt die Mail
 * dorthin (`canonicalHostFor()` — dieselbe pure Regel, die auch der
 * Tenant-Resolver und der 301 in `00.tenant.ts` benutzen). Auf die Subdomain zu
 * verlinken wäre nicht falsch — sie leitet ja um —, aber ein Kunde, der seine
 * Community unter ihrer eigenen Adresse kennt, bekäme in jeder Mail einen
 * fremden Namen zu sehen. Die zwei Spalten reisen dafür in `Query.select` mit.
 *
 * GEFILTERT WIRD IM CODE, NICHT IN DER ABFRAGE: `suspension` ist eine optionale
 * Spalte (control-034, `required: false`), und ein `Query.notEqual` würde in
 * SQL-Semantik jede Zeile mit NULL gleich mit aussortieren — dann fände dieser
 * Resolver plötzlich gar keinen Host mehr. Die Spalte reist deshalb in
 * `Query.select` mit und wird hier geprüft.
 */

export interface CommunityHostResolverOptions {
  endpoint: string
  projectId: string
  apiKey: string
  databaseId: string
  /** Cache-Dauer je Community. Default 60 s. */
  cacheTtlMs?: number
}

/** Cache-Key: der Ablage-Wert selbst (eine Instanz liest genau ein Control Plane). */
export function communityHostCacheKey(communityId: string): string {
  return communityId
}

export function createCommunityHostResolver(options: CommunityHostResolverOptions): CommunityHostResolver {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )
  const cache = createMicrocache<string | null>(options.cacheTtlMs ?? 60_000)

  return async (communityIds: string[]): Promise<Record<string, string>> => {
    const ids = [...new Set(communityIds.filter(Boolean))]
    if (ids.length === 0) return {}

    const hosts: Record<string, string> = {}
    const unknown: string[] = []
    for (const id of ids) {
      const cached = cache.get(communityHostCacheKey(id))
      if (cached === undefined) unknown.push(id)
      else if (cached) hosts[id] = cached
    }
    if (unknown.length === 0) return hosts

    try {
      // Query.equal nimmt maximal 100 Werte → in Blöcken (wie beim
      // Ehemaligen-Resolver).
      for (let i = 0; i < unknown.length; i += 100) {
        const chunk = unknown.slice(i, i + 100)
        const { rows } = await tablesDB.listRows<TenantRow>({
          databaseId: options.databaseId,
          tableId: COMMUNITIES_TABLE,
          queries: [
            Query.equal('tenantId', chunk),
            Query.equal('status', 'active'),
            Query.select(['tenantId', 'host', 'suspension', 'customDomain', 'customDomainStatus']),
            Query.limit(chunk.length),
          ],
        })
        const found = new Map(
          rows.filter(row => (row.suspension ?? '') !== 'abuse').map(row => [row.tenantId, canonicalHostFor(row)]),
        )
        for (const id of chunk) {
          const host = found.get(id) ?? ''
          cache.set(communityHostCacheKey(id), host || null)
          if (host) hosts[id] = host
        }
      }
      return hosts
    }
    catch {
      // Fail-soft: was aufgelöst ist, reist mit; der Rest fällt beim Aufrufer
      // auf `public.appUrl` zurück. Nichts cachen — nächster Versuch sofort.
      return hosts
    }
  }
}
