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

/** Eine Session eines Users (Admin-Sicht), ohne Secrets/Tokens — strukturell
 *  identisch mit core UserSession/SessionRow (geteilte SessionsTable). */
export interface AdminUserSession {
  $id: string
  $createdAt: string
  $updatedAt: string
  provider: string
  ip: string
  osCode: string
  osName: string
  osVersion: string
  clientType: string
  clientName: string
  clientVersion: string
  clientEngine: string
  clientEngineVersion: string
  deviceName: string
  deviceBrand: string
  deviceModel: string
  countryCode: string
  countryName: string
  factors: string[]
  expire: string
  current: boolean
}

/** Ein Eintrag aus dem Appwrite-Aktivitätsprotokoll des Users (users.listLogs) */
export interface AdminUserActivity {
  event: string
  time: string
  ip: string
  countryCode: string
  countryName: string
  clientName: string
  clientVersion: string
  osName: string
  osVersion: string
  deviceName: string
}

/** Ein Benachrichtigungskanal des Users (users.listTargets) */
export interface AdminUserTarget {
  $id: string
  $createdAt: string
  name: string
  /** 'email' | 'sms' | 'push' */
  providerType: string
  identifier: string
  expired: boolean
}

/** Vollständigere User-Sicht für die Detailseite */
export interface AdminUserDetail extends AdminUserRow {
  phone: string
  phoneVerification: boolean
  registration: string
  bio: string
  avatarUrl: string
  /** MFA am Account aktiviert */
  mfa: boolean
  /** Letzte Passwortänderung (leer bei passwortlosen Accounts) */
  passwordUpdate: string
}

export interface AdminUserDetailResponse {
  user: AdminUserDetail
  sessions: AdminUserSession[]
  activity: AdminUserActivity[]
  targets: AdminUserTarget[]
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

/** Ein Bucket im Storage-Browser */
export interface StorageBucketOverview {
  id: string
  name: string
  files: StorageFileEntry[]
  totalBytes: number
  /** nur bei orphanAware-Buckets aussagekräftig */
  orphanCount: number
  /** true = Orphan-Erkennung aktiv (Avatars: Abgleich gegen prefs.avatarUrl) */
  orphanAware: boolean
  /** true = Löschen hier gesperrt (gdpr-exports: eigene Retention + Admin-Seite) */
  readOnly: boolean
}

export interface StorageOverview {
  /** false, wenn dem Key der buckets-/files-Scope fehlt */
  available: boolean
  buckets: StorageBucketOverview[]
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
  /** Deutsche Variante (Primär-Spalten) */
  title: string
  body: string
  /** Englische Variante — leer = Fallback auf die deutsche */
  titleEn: string
  bodyEn: string
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
