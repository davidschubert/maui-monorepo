import type { Models } from 'node-appwrite'
import type { UserSession } from '../../shared/types/session'

/**
 * Appwrite-Session → sichere Client-Form (EINE Quelle für Self-Sicht und
 * Admin-Detailseite). Secrets/Tokens (secret, providerAccessToken/-Refresh)
 * werden hier bewusst NICHT übernommen. Appwrite liefert für nicht auflösbare
 * (lokale/private) IPs 'Unknown'/'--' als Land — auf leer normalisiert, damit
 * die UI lokalisiert „Unbekannt" zeigen kann.
 */
export function mapSafeSession(s: Models.Session, current: boolean): UserSession {
  const countryName = (!s.countryName || s.countryName === 'Unknown' || s.countryName === '--') ? '' : s.countryName
  return {
    $id: s.$id,
    $createdAt: s.$createdAt,
    $updatedAt: s.$updatedAt,
    provider: s.provider,
    ip: s.ip,
    osCode: s.osCode,
    osName: s.osName,
    osVersion: s.osVersion,
    clientType: s.clientType,
    clientName: s.clientName,
    clientVersion: s.clientVersion,
    clientEngine: s.clientEngine,
    clientEngineVersion: s.clientEngineVersion,
    deviceName: s.deviceName,
    deviceBrand: s.deviceBrand,
    deviceModel: s.deviceModel,
    countryCode: countryName ? s.countryCode : '',
    countryName,
    factors: s.factors ?? [],
    expire: s.expire,
    current,
  }
}
