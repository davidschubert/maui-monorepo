/**
 * WEM GEHÖRT DIESE DOMAIN SCHON? — über BEIDE Sorten Site (control-036).
 *
 * Seit es eigene Domains für Pool-Communities (control-035) UND für Silos
 * (control-036) gibt, kann eine Domain auf zwei verschiedene Arten belegt
 * sein: als `communities.customDomain` oder als `websites.customDomain`. Beide
 * Tabellen leben im selben Control-Plane-Projekt, beide Adressen zeigen auf
 * dieselben Server.
 *
 * Fragte jede Seite nur ihre eigene Tabelle, wäre `www.kunde.de` gleichzeitig
 * an eine Community und an ein Silo vergebbar. Beide bekämen ihren Alias bzw.
 * Tenant bei ploi, und wer dann tatsächlich antwortet, entschiede die
 * Reihenfolge der nginx-vHosts — also nichts, worauf man zeigen könnte. Der
 * Kunde, dessen Domain „manchmal die falsche Seite" zeigt, hat dann ein
 * Problem, das man nicht mehr nachvollziehen kann.
 *
 * Also EINE Frage an beide Tabellen, und zwar über BEIDE FORMEN (www ↔ Apex):
 * trägt jemand `www.kunde.de`, ist auch `kunde.de` vergeben — sie lösen auf
 * dieselbe Seite auf.
 *
 * ── WARUM DAS EIN RENNEN BLEIBT, UND WARUM DAS IN ORDNUNG IST ─────────────
 * Zwei gleichzeitige Eintragungen könnten theoretisch beide durchkommen (wie
 * schon bei control-035 festgehalten). Die FREISCHALTUNG nicht: der
 * TXT-Record trägt genau EIN Token, also kommt höchstens eine der beiden je
 * auf `active` — und nur `active` macht eine Adresse kanonisch. Ein verteiltes
 * Schloss für ein Fenster von Millisekunden wäre teurer als die Tatsache, die
 * es verhindert.
 */
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { customDomainForms } from '../../shared/customDomain'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { WEBSITES_TABLE, type WebsiteRow } from '../../shared/types/website'

export interface DomainOwnershipQuery {
  /** Die eingetragene Form; beide Formen werden daraus gerechnet. */
  domain: string
  /** Row-Id der Community, die sie schon haben DARF ('' = keine). */
  allowCommunityId?: string
  /** Row-Id der Website, die sie schon haben DARF ('' = keine). */
  allowWebsiteId?: string
}

/**
 * true = die Domain (oder ihre Geschwister-Form) gehört bereits jemand
 * ANDEREM. Wirft nur, wenn die Abfrage selbst scheitert — ein Lesefehler darf
 * hier NICHT als „frei" durchgehen.
 */
export async function customDomainTakenByOther(
  event: H3Event,
  query: DomainOwnershipQuery,
): Promise<boolean> {
  const forms = customDomainForms(query.domain)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const [communities, websites] = await Promise.all([
    admin.tablesDB.listRows<TenantRow>({
      databaseId, tableId: COMMUNITIES_TABLE,
      queries: [Query.equal('customDomain', forms), Query.limit(5)],
    }),
    admin.tablesDB.listRows<WebsiteRow>({
      databaseId, tableId: WEBSITES_TABLE,
      queries: [Query.equal('customDomain', forms), Query.limit(5)],
    }),
  ]).catch((error) => { throw toH3Error(error, 'Could not check domain') })

  return communities.rows.some(row => row.$id !== query.allowCommunityId)
    || websites.rows.some(row => row.$id !== query.allowWebsiteId)
}
