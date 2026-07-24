import { Client, Query, TablesDB } from 'node-appwrite'
import { createMicrocache } from '../../../core/server/utils/microcache'
import type { TenantResolver } from '../../../core/server/utils/tenantResolver'
import type { TenantContext } from '../../../core/shared/types/tenant'
import { TENANT_PLANS_TABLE, TENANTS_TABLE, parseTenantPlanLimits, type TenantPlanLimits, type TenantPlanRow, type TenantRow } from '../../shared/types/tenantRecord'

/**
 * Horizont-3 Naht 1 — Resolver-Implementierung über die tenants-Table des
 * Control Plane (Migration studio-010). Eine Platform-App registriert das
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

/** Pure (unit-getestet): tenants-Row (+ optionaler Plan-Katalog) → TenantContext. */
export function mapTenantRowToContext(
  row: Pick<TenantRow, 'mode' | 'projectId' | 'tenantId' | 'status' | 'plan'> | null,
  planCatalog?: Record<string, Record<string, TenantPlanLimits>>,
): TenantContext | null {
  if (!row || row.status !== 'active') return null
  if (row.mode === 'silo') return { mode: 'silo', projectId: row.projectId }
  // Pool ohne tenantId wäre ein Datenfehler — NIE ungescoped durchlassen
  if (row.mode === 'pool' && row.tenantId) {
    // '' (Bestand vor studio-013) → free; der Plan staffelt die Quota.
    // Limits aus dem EDITIERBAREN Katalog (tenant_plans, studio-014) — wenn
    // vorhanden, reisen sie aufgelöst im Context (Vorrang vor app.config).
    const plan = row.plan || 'free'
    const limits = planCatalog?.[plan] ?? planCatalog?.free
    return { mode: 'pool', projectId: row.projectId, tenantId: row.tenantId, plan, ...(limits ? { limits } : {}) }
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
  // Editierbarer Quota-Katalog (tenant_plans, studio-014): EIN Eintrag für
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
        tableId: TENANT_PLANS_TABLE,
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

    const [{ rows }, planCatalog] = await Promise.all([
      tablesDB.listRows<TenantRow>({
        databaseId: options.databaseId,
        tableId: TENANTS_TABLE,
        queries: [Query.equal('host', host), Query.limit(1)],
      }),
      loadPlanCatalog(),
    ])
    const context = mapTenantRowToContext(rows[0] ?? null, planCatalog)
    cache.set(host, context)
    return context
  }
}
