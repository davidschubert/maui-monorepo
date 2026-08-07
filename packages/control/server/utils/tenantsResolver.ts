import { Client, Query, TablesDB } from 'node-appwrite'
import { createMicrocache } from '../../../core/server/utils/microcache'
import type { TenantResolver } from '../../../core/server/utils/tenantResolver'
import type { TenantContext } from '../../../core/shared/types/tenant'
import { communityIsOffline, resolveCommunitySuspension } from '../../../core/shared/communitySuspension'
import { DEFAULT_TENANT_PLAN, COMMUNITY_PLANS_TABLE, COMMUNITIES_TABLE, normalizeTenantPlan, parseTenantPlanLimits, resolveTenantAudience, resolveTenantOpenRegistration, type TenantPlanLimits, type TenantPlanRow, type TenantRow } from '../../shared/types/tenantRecord'
import { isSafeThemeToken } from '../../shared/onboarding'
import { canonicalHostFor, customDomainCandidates } from '../../shared/customDomain'

/**
 * Horizont-3 Naht 1 — Resolver-Implementierung über die tenants-Table des
 * Control Plane (Migration control-010). Eine Platform-App registriert das
 * Ergebnis per Nitro-Plugin:
 *
 *   registerTenantResolver(createTenantsTableResolver({ endpoint, projectId,
 *     apiKey, databaseId }))
 *
 * Verbindungsdaten sind EXPLIZIT (kein useRuntimeConfig): der Leser läuft in
 * einem anderen Projekt als das Control Plane — Cross-Projekt-Read mit einem
 * read-only-Key (Scope rows.read). Gecacht via Microcache (Default 30 s),
 * auch NEGATIV (unbekannter Host → null), damit fremde Hosts das Control
 * Plane nicht pro Request hämmern können.
 */

/** Pure (unit-getestet): tenants-Row (+ optionaler Plan-Katalog) → TenantContext.
 *  communityId = row.$id (G1: der Tenant IST die kanonische Kunden-Site) — additiv
 *  gesetzt, wenn die Row eine $id trägt (der reale Read immer; Test-Fixtures
 *  optional). Trägt die Site-Rollen-Auflösung (requireCommunityPermission). */
export function mapTenantRowToContext(
  row: (Pick<TenantRow, 'mode' | 'projectId' | 'tenantId' | 'status' | 'plan'> & { $id?: string, host?: string | null, theme?: string | null, variant?: string | null, neutral?: string | null, name?: string | null, openRegistration?: boolean | null, audience?: string | null, trialEndsAt?: string | null, suspension?: string | null, customDomain?: string | null, customDomainStatus?: string | null }) | null,
  planCatalog?: Record<string, Record<string, TenantPlanLimits>>,
): TenantContext | null {
  if (!row || row.status !== 'active') return null

  /**
   * DIE ABUSE-SPERRE (M13, Davids Entscheidung vom 2026-08-02): der Host geht
   * SOFORT und VOLLSTÄNDIG offline.
   *
   * Sie steht hier und nicht in der Middleware, und das ist der ganze Trick:
   * `null` heißt für `00.tenant.ts` „diesen Host gibt es nicht", also fällt der
   * bestehende C12b-Pfad an — 404 mit `data.code: 'unknown_host'`, die
   * gebrandete Fehlerseite, Seiten UND API, ohne dass eine einzige Route davon
   * wissen muss. Eine zweite Wurfstelle in der Middleware wäre ein zweiter Ort,
   * an dem jemand einen Pfad vergisst.
   *
   * Dass ein Gesperrter dieselbe Antwort bekommt wie ein Vertipper, ist
   * beabsichtigt: der Betreiber erklärt eine Sperre dem Owner (per Mail und im
   * Kundenbereich), nicht der Öffentlichkeit auf einer Seite, die jeder aufrufen
   * kann.
   */
  if (communityIsOffline(resolveCommunitySuspension(row.suspension))) return null

  const communityId = row.$id ? { communityId: row.$id } : {}
  // Zugangsregel des Mandanten (S1, control-018). IMMER explizit gesetzt —
  // der Resolver ist die einzige Stelle, an der die fail-OPEN-Auflösung von
  // `null` (Bestand vor der Migration) stattfindet.
  //
  // `audience` (C18, control-016) kommt daneben und wird GENAU ANDERSHERUM
  // gelesen: fail-CLOSED. Der Resolver ist auch dafür die einzige Stelle — ab
  // hier trägt der Kontext den aufgelösten Wert, und niemand vergleicht die
  // rohe Spalte noch einmal selbst (das war die Falle, wegen der
  // resolveTenantAudience() überhaupt eine Funktion ist).
  const policy = {
    openRegistration: resolveTenantOpenRegistration(row.openRegistration),
    audience: resolveTenantAudience(row.audience),
    // Nach dem Abuse-Ausstieg oben kann hier nur noch '' oder 'billing' stehen.
    // IMMER explizit gesetzt — dieselbe Regel wie bei openRegistration: ab hier
    // trägt der Kontext den aufgelösten Wert, und niemand vergleicht die rohe
    // Spalte noch einmal selbst.
    suspension: resolveCommunitySuspension(row.suspension),
  }
  // Branding des Mandanten (O5). Nur attribut-sichere Tokens reisen mit: die
  // Werte landen als data-theme/data-variant/data-neutral im <html>, und der
  // Wächter hier ist die erste von zwei Linien (die zweite ist SAFE_ATTR im
  // themes-Layer). `neutral` (control-020) läuft durch dieselbe Prüfung wie die
  // anderen zwei — fehlender/leerer Wert lässt das Feld weg und heißt damit
  // „keine Wahl der Community" (Besucher-Verhalten wie bisher).
  // `name` ist bewusst UNGEFILTERT dabei — reiner Anzeigetext (Header), wird
  // nur interpoliert gerendert, nie als Attribut/HTML.
  const branding = {
    ...(row.theme && isSafeThemeToken(row.theme) ? { theme: row.theme } : {}),
    ...(row.variant && isSafeThemeToken(row.variant) ? { variant: row.variant } : {}),
    ...(row.neutral && isSafeThemeToken(row.neutral) ? { neutral: row.neutral } : {}),
    ...(row.name ? { name: row.name } : {}),
  }
  /**
   * DIE KANONISCHE ADRESSE (control-035, Davids Entscheidung 2): aktive eigene
   * Domain, sonst die Pukalani-Subdomain. Gerechnet vom PUREN
   * `canonicalHostFor()`, damit die Umleitung in `00.tenant.ts` und die
   * Mail-Links in D5 dieselbe Antwort bekommen.
   *
   * Das Feld bleibt WEG, wenn die Row keinen `host` trägt (Test-Fixtures) —
   * ein leerer kanonischer Host wäre eine Umleitung auf `https://`.
   */
  const address = row.host
    ? { canonicalHost: canonicalHostFor({ host: row.host, customDomain: row.customDomain, customDomainStatus: row.customDomainStatus }) }
    : {}
  if (row.mode === 'silo') return { mode: 'silo', projectId: row.projectId, ...communityId, ...branding, ...policy, ...address }
  // Pool ohne tenantId wäre ein Datenfehler — NIE ungescoped durchlassen
  if (row.mode === 'pool' && row.tenantId) {
    // normalizeTenantPlan: ''/'free'-Bestand → basic, 'business' → pro
    // (Rename 2026-07-26). Limits aus dem EDITIERBAREN Katalog (tenant_plans,
    // control-014) — wenn vorhanden, reisen sie aufgelöst im Context
    // (Vorrang vor app.config).
    const plan = normalizeTenantPlan(row.plan)
    const limits = planCatalog?.[plan] ?? planCatalog?.[DEFAULT_TENANT_PLAN]
    // Testphase (M13): roh durchgereicht, NICHT hier ausgewertet — der Kontext
    // trägt die Tatsache, die Regel (ab wann ein Hinweis fällig ist) steht pur
    // in shared/onboarding.ts. Fehlende Spalte/leerer Wert ⇒ Feld bleibt weg
    // und heißt „keine Testphase".
    const trial = row.trialEndsAt ? { trialEndsAt: row.trialEndsAt } : {}
    return { mode: 'pool', projectId: row.projectId, tenantId: row.tenantId, plan, ...(limits ? { limits } : {}), ...communityId, ...branding, ...policy, ...trial, ...address }
  }
  return null
}

export interface TenantsTableResolverOptions {
  endpoint: string
  projectId: string
  apiKey: string
  databaseId: string
  /** Cache-Dauer der Auflösung (positiv wie negativ). Default 30 s. */
  cacheTtlMs?: number
}

export function createTenantsTableResolver(options: TenantsTableResolverOptions): TenantResolver {
  const tablesDB = new TablesDB(
    new Client().setEndpoint(options.endpoint).setProject(options.projectId).setKey(options.apiKey),
  )
  const cache = createMicrocache<TenantContext | null>(options.cacheTtlMs ?? 30_000)
  // Editierbarer Quota-Katalog (tenant_plans, control-014): EIN Eintrag für
  // alle Hosts, eigener 60-s-Cache. Fehlt die Tabelle (Bestand vor der
  // Migration) oder wirft der Read: leerer Katalog → app.config-Fallback
  // in assertPoolWriteQuota greift (fail-open, nie Request-blockierend).
  const planCache = createMicrocache<Record<string, Record<string, TenantPlanLimits>>>(60_000)
  async function loadPlanCatalog(): Promise<Record<string, Record<string, TenantPlanLimits>>> {
    const cached = planCache.get('catalog')
    if (cached !== undefined) return cached
    const catalog: Record<string, Record<string, TenantPlanLimits>> = {}
    try {
      const { rows } = await tablesDB.listRows<TenantPlanRow>({
        databaseId: options.databaseId,
        tableId: COMMUNITY_PLANS_TABLE,
        queries: [Query.limit(25)],
      })
      for (const row of rows) catalog[row.key] = parseTenantPlanLimits(row.limits)
    }
    catch {
      // Tabelle fehlt / transienter Fehler → leerer Katalog (Fallback-Kette)
    }
    planCache.set('catalog', catalog)
    return catalog
  }

  return async (host: string): Promise<TenantContext | null> => {
    if (!host) return null
    const cached = cache.get(host)
    if (cached !== undefined) return cached

    const [row, planCatalog] = await Promise.all([findCommunityForHost(tablesDB, options.databaseId, host), loadPlanCatalog()])
    const context = mapTenantRowToContext(row, planCatalog)
    cache.set(host, context)
    return context
  }
}

/**
 * ZWEI FRAGEN, ZWEI ABFRAGEN, EINE ANTWORT (control-035): gehört dieser Host
 * einer Community als PUKALANI-SUBDOMAIN oder als EIGENE DOMAIN?
 *
 * REIHENFOLGE IST ABSICHT. Die Subdomain wird zuerst gefragt und beantwortet
 * damit den Normalfall in EINER Abfrage — jede Community hat eine, die
 * allerwenigsten haben eine eigene Domain. Erst wenn dort nichts steht, kostet
 * es eine zweite Abfrage. (Das gilt auch für den 404-Fall eines fremden Hosts:
 * der kostet jetzt zwei Abfragen statt einer — aber nur EINMAL je 30 s, weil
 * der Microcache NEGATIV cacht.)
 *
 * ABGEFRAGT WERDEN BEIDE FORMEN (`customDomainCandidates`): steht in der
 * Tabelle `www.kunde.de` und kommt ein Request für `kunde.de` herein, findet
 * `Query.equal('customDomain', ['kunde.de', 'www.kunde.de'])` dieselbe Zeile.
 * Der Aufrufer merkt den Unterschied trotzdem — `canonicalHostFor()` liefert
 * die EINGETRAGENE Form, und `00.tenant.ts` leitet dorthin um.
 *
 * DER STATUS WIRD IM CODE GEFILTERT, NICHT IN DER ABFRAGE — dieselbe
 * Begründung wie bei `suspension` im communityHostResolver: die Spalte ist
 * optional (control-035, `required: false`), und ein zweiter Gleichheitsfilter
 * bräuchte einen zweiten Index UND würde Zeilen mit NULL still aussortieren.
 * Gefiltert wird durch `canonicalHostFor()`: eine Zeile, deren Domain NICHT
 * 'active' ist, liefert als kanonischen Host ihre Subdomain — der Request-Host
 * passt dann zu nichts, und wir geben `null` zurück (404, wie ein unbekannter
 * Host). Genau das soll passieren, solange das Zertifikat fehlt.
 */
async function findCommunityForHost(
  tablesDB: TablesDB,
  databaseId: string,
  host: string,
): Promise<TenantRow | null> {
  const { rows } = await tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [Query.equal('host', host), Query.limit(1)],
  })
  if (rows[0]) return rows[0]

  const candidates = customDomainCandidates(host)
  if (!candidates.length) return null
  const { rows: byDomain } = await tablesDB.listRows<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    queries: [Query.equal('customDomain', candidates), Query.limit(2)],
  })
  // Der Kandidat muss AKTIV sein — sonst ist die Zeile für diesen Host so gut
  // wie nicht vorhanden (s. Kopf). Mehr als eine Treffer-Zeile darf es nicht
  // geben (die Eindeutigkeit setzt `domain/set.post.ts` durch); käme es doch
  // dazu, gewinnt niemand: `find` nimmt die erste AKTIVE, und das ist
  // deterministisch genug für einen Zustand, den es nicht geben darf.
  return byDomain.find(row => canonicalHostFor(row) !== row.host) ?? null
}
