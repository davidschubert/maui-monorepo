import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Embed-Session-Handoff (E2, Embed-Plan § 3a): das Login-POPUP (Top-Level,
 * first-party Session) reicht die Session an das cross-site eingebettete
 * IFRAME weiter — niemals als roher Session-Secret über postMessage, sondern
 * als kurzlebiges, verschlüsseltes Token:
 *
 *   Popup:  POST /api/auth/embed-handoff  → sealHandoffToken(secret)
 *   iframe: POST /api/auth/embed-session  → openHandoffToken(token)
 *           → Secret gegen Appwrite validieren → Cookie mit Partitioned setzen
 *
 * STATELESS (AES-256-GCM + eingebetteter Ablauf): funktioniert über alle
 * pm2-Cluster-Worker hinweg ohne geteilten Store. Der Schlüssel wird aus dem
 * server-only Appwrite-API-Key abgeleitet (stabil pro App, nie im Client).
 * Replay innerhalb der 60 s ist bewusst akzeptiert: das Token transportiert
 * nur zwischen ZWEI Kontexten unserer eigenen Origin (postMessage mit
 * striktem targetOrigin) und /api/auth/embed-session validiert das Secret
 * ohnehin gegen Appwrite, bevor irgendein Cookie gesetzt wird.
 */

export const HANDOFF_TTL_MS = 60_000

export function deriveHandoffKey(serverSecret: string): Buffer {
  return createHash('sha256').update(`${serverSecret}:maui-embed-handoff`).digest()
}

/** Session-Secret in ein kurzlebiges Token einsiegeln (base64url iv.tag.cipher). */
export function sealHandoffToken(sessionSecret: string, key: Buffer, now: number = Date.now()): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const payload = JSON.stringify({ s: sessionSecret, exp: now + HANDOFF_TTL_MS })
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64url')
}

/** Token öffnen — null bei Manipulation, falschem Schlüssel oder Ablauf. */
export function openHandoffToken(token: string, key: Buffer, now: number = Date.now()): string | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16 + 1) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const encrypted = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')) as { s?: unknown, exp?: unknown }
    if (typeof payload.s !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp < now) return null
    return payload.s
  }
  catch {
    return null
  }
}
