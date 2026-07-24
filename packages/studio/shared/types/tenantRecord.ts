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

/** H3-4.2: Silo-Schema-Updates rollen in DREI Wellen aus (Blueprint L5).
 *  Pool-Tenants teilen EIN Projekt — ihre Welle ist ohne Wirkung. */
export const TENANT_WAVES = ['internal', 'canary', 'stable'] as const
export type TenantWave = (typeof TENANT_WAVES)[number]

/** Quota-Plan des Pool-Tenants (studio-013); staffelt die Quota-Limits
 *  (maui.tenancy.quota.plans). Default free; für Silo ohne Wirkung. */
export const TENANT_PLANS = ['free', 'pro', 'business'] as const
export type TenantPlan = (typeof TENANT_PLANS)[number]

/** Row-Typ zur `tenants`-Table (Schema: Migrationen studio-010/011). */
export interface TenantRow extends Models.Row {
  /** Anzeigename des Kunden (studio-011); '' = Bestand vor der Migration. */
  name: string
  /** Kanonischer Host (klein, ohne Port) — Unique-Index uq_host. */
  host: string
  mode: TenantMode
  /** Appwrite-Projekt, das den Host bedient (Pool: das geteilte Projekt). */
  projectId: string
  /** Zeilen-Scope im Pool (Migrationen wie comments-011); '' bei silo. */
  tenantId: string
  /** disabled = Host bewusst offline (Resolver liefert null → 404). */
  status: TenantStatus
  /** Update-Welle des BACKING-Projekts (studio-012); '' = Bestand → stable. */
  wave: TenantWave | ''
  /** Quota-Plan (studio-013); '' = Bestand → free. */
  plan: TenantPlan | ''
}

export const TENANTS_TABLE = 'tenants'
