/**
 * Vertrag der Kommentar-Moderations-API (Typen-Entwirrung nach A14): Die
 * Routen /api/admin/comments/* gehören seit dem Moderations-Umzug dem
 * comments-Layer — die Typen dazu jetzt auch (vorher admin/shared; comments
 * griff dafür quer in einen Layer, von dem es nicht abhängt). admin rendert
 * sein Dashboard-Widget über eigene MINIMALE lokale Shapes (strukturell
 * kompatibel, kein Import) — Fundament-Layer hängen nie von Features ab.
 */

export type ModerationFilter = 'reported' | 'hidden' | 'all'

/** Comment-Shape der Moderations-Liste (GET /api/admin/comments). */
export interface ModeratedComment {
  $id: string
  $createdAt: string
  content: string
  authorId: string
  authorName: string
  targetId: string
  targetType: string
  status: string
  /** Anzahl offener Meldungen (nur im 'reported'-Filter gesetzt; Moderation-Layer) */
  reportCount?: number
}

export interface AdminCommentListResponse {
  total: number
  comments: ModeratedComment[]
  /** true = KI-Assist nutzbar (maui.ai an + NUXT_AI_KEY gesetzt) → UI zeigt den Button */
  aiAssist: boolean
}

/**
 * Advisory-Antwort des KI-Moderations-Assists (POST /api/admin/comments/:id/assist).
 * Reine Empfehlung — Aktionen löst weiterhin der Moderator aus.
 * posts hat bewusst eine EIGENE PostModerationAssist-Shape (gleiches Muster).
 */
export interface ModerationAssist {
  /** 'hide' = Ausblenden empfohlen · 'dismiss' = Kommentar ok, Meldungen verwerfen */
  action: 'hide' | 'dismiss'
  /** Schwere des Verstoßes 1 (harmlos) – 5 (gravierend) */
  severity: number
  /** 2-3 Sätze Begründung (Deutsch) */
  assessment: string
  /** Verwendetes Model (Transparenz im UI/Debugging) */
  model: string
}
