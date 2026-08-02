import type { Models } from 'node-appwrite'

/**
 * Lifecycle-Status einer Site (Strategie L2/P2, 5./6. Runde): provisioning/
 * error stammen vom Provisioner (M7); active..deleted vom Betriebs-Lifecycle.
 */
export const WEBSITE_STATUSES = [
  'active', 'provisioning', 'error', 'suspended',
  'exporting', 'deletion_scheduled', 'deletion_failed', 'legal_hold',
] as const
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number]

export const HEALTH_STATUSES = ['ok', 'degraded', 'down', 'unknown'] as const
export type HealthStatus = (typeof HEALTH_STATUSES)[number]

/** Row-Typ zur `websites`-Table (Schema: control-001, Rename control-022). */
export interface WebsiteRow extends Models.Row {
  name: string
  /** Anzeige-Slug (veränderlich) — die Projekt-ID ist die unveränderliche Identität (F6). */
  slug: string
  projectId: string
  endpoint: string
  appUrl: string
  status: WebsiteStatus
  healthStatus: HealthStatus
  healthCheckedAt: string | null
  notes: string
  /** JSON-Array der wirksam aktiven Produkt-Keys der Site — Snapshot vom
   *  Health-Sweep (GET /api/platform/products der Site, M6-T4). */
  products: string
}

// Physischer Name seit control-022 (`sites` → `websites`; control-026 hat die
// alte Tabelle gelöscht). Der E8-Rename-Commit hatte nur den Konstanten-NAMEN
// umgestellt und den Wert vergessen — alle Register-Routen liefen ins 404.
export const WEBSITES_TABLE = 'websites'
