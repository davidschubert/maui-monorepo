/**
 * Sichere Teilmenge eines Appwrite-Models.Session für den Client — ohne
 * Secrets/Tokens (providerAccessToken etc. werden NIE geleakt).
 */
export interface UserSession {
  $id: string
  $createdAt: string
  $updatedAt: string
  provider: string
  ip: string
  osName: string
  osVersion: string
  clientName: string
  clientVersion: string
  deviceName: string
  countryName: string
  current: boolean
}

export interface UserSessionListResponse {
  sessions: UserSession[]
}

/** Gemeinsame Felder für die Sessions-Tabelle (UserSession & AdminUserSession erfüllen sie). */
export interface SessionRow {
  $id: string
  $createdAt: string
  $updatedAt: string
  clientName: string
  clientVersion: string
  osName: string
  osVersion: string
  ip: string
  countryName: string
  current: boolean
}
