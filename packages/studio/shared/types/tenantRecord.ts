import type { Models } from 'node-appwrite'

/**
 * Horizont-3 tenants-Register (Blueprint Naht 1): das Control Plane (studio)
 * BESITZT die Zuordnung Host → Mandant. Gelesen wird sie von Platform-Apps
 * über createTenantsTableResolver (server/utils/tenantsResolver.ts) — mit
 * expliziten Verbindungsdaten, weil der Leser in einem ANDEREN Projekt läuft
 * (Cross-Projekt-Read auf das Control Plane, read-only).
 */

export const TENANT_MODES = ['pool', 'silo'] as const
export type TenantMode = (typeof TENANT_MODES)[number]

export const TENANT_STATUSES = ['active', 'disabled'] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]

/** Row-Typ zur `tenants`-Table (Schema: Migration studio-010). */
export interface TenantRow extends Models.Row {
  /** Kanonischer Host (klein, ohne Port) — Unique-Index uq_host. */
  host: string
  mode: TenantMode
  /** Appwrite-Projekt, das den Host bedient (Pool: das geteilte Projekt). */
  projectId: string
  /** Zeilen-Scope im Pool (Migrationen wie comments-011); '' bei silo. */
  tenantId: string
  /** disabled = Host bewusst offline (Resolver liefert null → 404). */
  status: TenantStatus
}

export const TENANTS_TABLE = 'tenants'
