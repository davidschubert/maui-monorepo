import type { Models } from 'node-appwrite'

export const COMMENTS_TABLE = 'comments'
export const VOTES_TABLE = 'comment_votes'

/**
 * Sichtbarkeits-Status (Soft-Delete + Moderation):
 * active → normal · hidden → von Moderation ausgeblendet ·
 * deleted → Soft-Delete ([gelöscht]-Platzhalter).
 * Melden läuft über den Moderation-Layer (reports-Tabelle), NICHT über den Status.
 */
export type CommentStatus = 'active' | 'hidden' | 'deleted'

export type SortMode = 'top' | 'new' | 'controversial'

export interface Comment extends Models.Row {
  /** Flexible Anbindung: Kommentare hängen an beliebigen Objekten */
  targetId: string
  targetType: string
  content: string
  authorId: string
  authorName: string
  /**
   * Avatar-URL des Autors — KEINE DB-Spalte, sondern beim Lesen aus den
   * Account-prefs angereichert (immer aktuell). Bei Realtime-Events fremder
   * User fehlt sie → UserAvatar fällt auf Initialen zurück, bis neu geladen wird.
   */
  authorAvatarUrl?: string
  parentId: string | null
  /** Denormalisierte Zähler — server-autoritativ via AdminClient gepflegt */
  upvotes: number
  downvotes: number
  score: number
  status: CommentStatus
}

export interface CommentVote extends Models.Row {
  commentId: string
  userId: string
  /** 1 = Upvote, -1 = Downvote */
  value: number
}

export type VoteValue = 1 | -1

/** GET /api/comments Response: Rows + eigene Votes als separate Map */
export interface CommentListResponse {
  total: number
  rows: Comment[]
  myVotes: Record<string, VoteValue>
  /** IDs der Kommentare, die der eingeloggte User offen gemeldet hat (Moderation-Layer) */
  myReports: string[]
}

/** POST /:id/vote Response: frischer Zähler-Stand + eigener Vote (null = entfernt) */
export interface VoteResponse {
  comment: Comment
  myVote: VoteValue | null
}

/** Baumknoten für die rekursive Darstellung */
export interface CommentNode {
  comment: Comment
  children: CommentNode[]
}
