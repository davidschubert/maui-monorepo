import { Client, Query, TablesDB } from 'node-appwrite'
import { createMicrocache } from '../../../core/server/utils/microcache'
import type { TenantResolver } from '../../../core/server/utils/tenantResolver'
import type { TenantContext } from '../../../core/shared/types/tenant'
import { TENANTS_TABLE, type TenantRow } from '../../shared/types/tenantRecord'

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

/** Pure (unit-getestet): tenants-Row → TenantContext. */
export function mapTenantRowToContext(row: Pick<TenantRow, 'mode' | 'projectId' | 'tenantId' | 'status'> | null): TenantContext | null {
  if (!row || row.status !== 'active') return null
  if (row.mode === 'silo') return { mode: 'silo', projectId: row.projectId }
  // Pool ohne tenantId wäre ein Datenfehler — NIE ungescoped durchlassen
  if (row.mode === 'pool' && row.tenantId) return { mode: 'pool', projectId: row.projectId, tenantId: row.tenantId }
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

  return async (host: string): Promise<TenantContext | null> => {
    if (!host) return null
    const cached = cache.get(host)
    if (cached !== undefined) return cached

    const { rows } = await tablesDB.listRows<TenantRow>({
      databaseId: options.databaseId,
      tableId: TENANTS_TABLE,
      queries: [Query.equal('host', host), Query.limit(1)],
    })
    const context = mapTenantRowToContext(rows[0] ?? null)
    cache.set(host, context)
    return context
  }
}
