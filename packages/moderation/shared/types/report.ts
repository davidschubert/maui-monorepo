import type { Models } from 'node-appwrite'

/**
 * Domänen-agnostisches Melde-Modell. Eine `reports`-Row = eine Meldung eines
 * Users gegen ein beliebiges Target (Comment, User, …) — adressiert über
 * targetType + targetId (gleiches polymorphe Muster wie comments).
 * Die Konsequenz (Hide/Block) gehört NICHT hierher (Layer-Grenze A14).
 */
export const REPORTS_TABLE = 'reports'

export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

export interface Report extends Models.Row {
  reporterId: string
  targetType: string
  targetId: string
  reason: string
  note: string | null
  status: ReportStatus
  resolvedBy: string | null
  resolution: string | null
  /** H3-Pool-Datenpfad (moderation-002); '' = Silo/Einzelbetrieb. */
  tenantId?: string
}

/** Eine wählbare Begründung — Label liefert (lokalisiert) der Konsument. */
export interface ReportReason {
  value: string
  label: string
}

export interface ReportListResponse {
  total: number
  rows: Report[]
}
