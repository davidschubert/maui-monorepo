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

/** Row-Typ zur `sites`-Table (Schema: Migration control-001). */
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
  /** TOTE SPALTE (Migration control-006). Sie zeigte auf `workspaces`, und die
   *  Tabelle ist mit A6 Schritt 5 gefallen; niemand liest oder schreibt sie
   *  noch. Sie steht hier nur, weil die Spalte in der DB noch existiert —
   *  control-031 räumt `communities.workspaceId` ab, diese hier bewusst nicht
   *  im selben Zug (websites ist das Studio-Register, eigener Schritt). */
  workspaceId: string
}

export const WEBSITES_TABLE = 'sites'
