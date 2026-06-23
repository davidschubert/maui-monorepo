/** Auf sichere Felder reduzierter Appwrite-User für die Admin-UI */
export interface AdminUserRow {
  $id: string
  name: string
  email: string
  avatarUrl: string
  $createdAt: string
  /** Letzter Zugriff — leer, wenn nie aktiv */
  accessedAt: string
  emailVerification: boolean
  phoneVerification: boolean
  /** true = aktiv, false = blockiert (Appwrite-Semantik) */
  status: boolean
  labels: string[]
  /** Presence: gerade online (Heartbeat < 45s) */
  online: boolean
  /** Presence: letzter Heartbeat (ISO) — leer, wenn nicht (kürzlich) anwesend */
  lastSeen: string
}

export interface AdminUserListResponse {
  total: number
  users: AdminUserRow[]
}

/** Eine Session eines Users (Admin-Sicht), ohne Secrets/Tokens */
export interface AdminUserSession {
  $id: string
  $createdAt: string
  $updatedAt: string
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

/** Ein Tag in der Analytics-Zeitreihe */
export interface AnalyticsPoint {
  date: string
  users: number
  comments: number
}

export interface AdminAnalytics {
  rangeDays: number
  points: AnalyticsPoint[]
  usersInRange: number
  commentsInRange: number
}

/** Eine Datei im Storage-Browser */
export interface StorageFileEntry {
  $id: string
  name: string
  sizeBytes: number
  mimeType: string
  $createdAt: string
  /** true = von keinem User-Profil referenziert */
  orphan: boolean
  /** Name des Accounts, der diese Datei als Avatar nutzt — leer wenn orphan */
  linkedUserName: string
}

export interface StorageOverview {
  /** false, wenn Bucket fehlt oder dem Key der files-Scope fehlt */
  available: boolean
  bucketId: string
  files: StorageFileEntry[]
  totalBytes: number
  orphanCount: number
}

/** Ein protokollierter Admin-Vorgang */
export interface AuditLogEntry {
  $id: string
  $createdAt: string
  actorId: string
  actorName: string
  /** Avatar-URL des Actors aus den Account-prefs — beim Lesen angereichert */
  actorAvatarUrl: string
  action: string
  targetType: string
  targetId: string
  targetName: string
  metadata: string
  ip: string
}

export interface AuditLogListResponse {
  total: number
  entries: AuditLogEntry[]
}

/** Ein Produkt-Changelog-Eintrag ("Was ist neu") */
export interface ChangelogEntry {
  $id: string
  $createdAt: string
  /** Release-Datum (ISO) — unabhängig von $createdAt; steuert Anzeige + Sortierung */
  date: string
  title: string
  body: string
  /** 'feature' | 'improvement' | 'fix' — für ein farbiges Badge */
  category: string
  version: string
  published: boolean
}

export interface ChangelogListResponse {
  total: number
  entries: ChangelogEntry[]
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
