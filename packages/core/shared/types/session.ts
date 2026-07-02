/**
 * Sichere Teilmenge eines Appwrite-Models.Session für den Client — ohne
 * Secrets/Tokens (secret, providerAccessToken/RefreshToken werden NIE geleakt).
 * Ansonsten bewusst VOLLSTÄNDIG: alles, was Appwrite über eine Session weiß
 * (Browser/Engine, OS, Gerät, Geo, Auth-Provider, MFA-Faktoren, Ablauf).
 */
export interface UserSession {
  $id: string
  $createdAt: string
  $updatedAt: string
  /** Auth-Weg dieser Session: 'email', OAuth-Provider-Name, 'magic-url', … */
  provider: string
  ip: string
  osCode: string
  osName: string
  osVersion: string
  /** 'browser' | 'app' | … (Appwrite clientType) */
  clientType: string
  clientName: string
  clientVersion: string
  /** Render-Engine (Blink/WebKit/Gecko …) */
  clientEngine: string
  clientEngineVersion: string
  /** Geräteklasse/-marke/-modell aus dem User-Agent (z. B. smartphone/Apple/iPhone) */
  deviceName: string
  deviceBrand: string
  deviceModel: string
  /** ISO-Ländercode (klein, z. B. 'de') — für Flaggen-Icons */
  countryCode: string
  countryName: string
  /** MFA-Faktoren dieser Session (z. B. ['password', 'totp']) */
  factors: string[]
  /** Ablaufzeitpunkt (ISO) */
  expire: string
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
  provider: string
  clientType: string
  clientName: string
  clientVersion: string
  clientEngine: string
  clientEngineVersion: string
  osName: string
  osVersion: string
  deviceName: string
  deviceBrand: string
  deviceModel: string
  ip: string
  countryCode: string
  countryName: string
  factors: string[]
  expire: string
  current: boolean
}
