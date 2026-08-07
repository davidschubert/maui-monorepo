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

  /**
   * EIGENE DOMAIN JE SILO (control-036, 2026-08-07). Alle Felder optional mit
   * Default `''` — Zeilen von VOR der Migration tragen `null`, weil Appwrite
   * Spalten-Defaults nicht backfillt. Deshalb liest sie NIEMAND roh, sondern
   * immer über die puren Helfer in `shared/siteDomain.ts`.
   *
   * Wo diese Site bei ploi wohnt. Leer = nicht hinterlegt ⇒ der
   * Zertifikatsschritt hält ehrlich an, statt etwas zu raten.
   * (Heute: portfolio 390041, comments 389772, beide auf Server 118713.)
   */
  ploiServerId?: string | null
  ploiSiteId?: string | null
  /** Die EINGETRAGENE Form der Kundendomain — sie ist die kanonische. */
  customDomain?: string | null
  /** '' | pending_dns | pending_cert | pending_platform | active | error */
  customDomainStatus?: string | null
  /** 32 Hex-Zeichen, an GENAU DIESE Website gebunden (Eigentums-Nachweis). */
  customDomainToken?: string | null
  /** Der Text, den der BETREIBER liest. */
  customDomainError?: string | null
  customDomainVerifiedAt?: string | null
  customDomainActivatedAt?: string | null
}

// Physischer Name seit control-022 (`sites` → `websites`; control-026 hat die
// alte Tabelle gelöscht). Der E8-Rename-Commit hatte nur den Konstanten-NAMEN
// umgestellt und den Wert vergessen — alle Register-Routen liefen ins 404.
export const WEBSITES_TABLE = 'websites'
