/** Auf sichere Felder reduzierter Appwrite-User für die Admin-UI */
export interface AdminUserRow {
  $id: string
  name: string
  email: string
  $createdAt: string
  /** Letzter Zugriff — leer, wenn nie aktiv */
  accessedAt: string
  emailVerification: boolean
  /** true = aktiv, false = blockiert (Appwrite-Semantik) */
  status: boolean
  labels: string[]
}

export interface AdminUserListResponse {
  total: number
  users: AdminUserRow[]
}

/** Eine Session eines Users (Admin-Sicht), ohne Secrets/Tokens */
export interface AdminUserSession {
  $id: string
  $createdAt: string
  provider: string
  ip: string
  clientName: string
  clientVersion: string
  osName: string
  osVersion: string
  countryName: string
  current: boolean
}

/** Vollständigere User-Sicht für die Detailseite */
export interface AdminUserDetail extends AdminUserRow {
  phone: string
  phoneVerification: boolean
  registration: string
  bio: string
  avatarUrl: string
}

export interface AdminUserDetailResponse {
  user: AdminUserDetail
  sessions: AdminUserSession[]
  comments: ModeratedComment[]
  commentsTotal: number
}

export interface AdminStats {
  usersTotal: number
  commentsTotal: number
  commentsReported: number
}

/** Status-Filter der Moderations-Liste */
export type ModerationFilter = 'reported' | 'hidden' | 'all'

/**
 * Minimale Comment-Shape für die Moderation — bewusst lokal definiert
 * statt Cross-Package-Import aus packages/comments (Layer bleiben entkoppelt;
 * admin kennt nur die Felder, die es moderiert).
 */
export interface ModeratedComment {
  $id: string
  $createdAt: string
  content: string
  authorId: string
  authorName: string
  targetId: string
  targetType: string
  status: string
}

export interface AdminCommentListResponse {
  total: number
  comments: ModeratedComment[]
}
