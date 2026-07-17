import { createPublicKey, verify as cryptoVerify } from 'node:crypto'

/**
 * Entitlement-Dokument (F3, M8-Vorbereitung) — signierte Zustellung der
 * Site-Entitlements vom Control Plane an die Site:
 *
 *   <base64url(payload-JSON)>.<base64url(Ed25519-Signatur)>
 *
 * Signiert werden die UTF-8-Bytes des base64url-Payload-Segments (keine
 * JSON-Kanonisierung nötig). Schlüssel: Ed25519, öffentlich als SPKI-DER
 * (base64) in der Site-Env, Rotation über `kid` (Env hält eine kid→Key-Map).
 * Regeln aus der Strategie (§ F3, 4.–6. Runde):
 *  - Die SIGNATUR wird IMMER geprüft — toleriert wird nur der fachliche
 *    Ablauf (validUntil), nie ein ungültiges/gefälschtes Dokument.
 *  - validUntil < now ≤ graceUntil: last-known-good gilt weiter (Grace).
 *  - now > graceUntil: optionale Features degradieren auf AUS.
 *  - suspended: expliziter kaufmännischer Aus-Schalter (optionale Features).
 *  - foundation-Tier ist nie entitlement-geschaltet (core/system/themes/…).
 *  - Clock-Skew ±5 min auf issuedAt/graceUntil.
 *
 * Bewusst pure (nur node:crypto) — unit-testbar ohne Nuxt-Kontext.
 */

export const ENTITLEMENT_DOC_VERSION = 1
export const CLOCK_SKEW_MS = 5 * 60_000

export interface EntitlementPayload {
  v: number
  kid: string
  siteProjectId: string
  /** Zugeteilte Feature-Keys (nur optional-Tier ist enforcement-relevant). */
  features: string[]
  suspended: boolean
  issuedAt: string
  validUntil: string
  graceUntil: string
}

export type VerifyResult
  = | { ok: true, payload: EntitlementPayload }
    | { ok: false, reason: string }

/**
 * kid→Public-Key-Map aus der runtimeConfig lesen. Nitro wendet destr auf
 * Env-Werte an — NUXT_ENTITLEMENTS_PUBLIC_KEYS='{"k1":"…"}' kommt daher als
 * OBJEKT an, nicht als String; beide Formen werden akzeptiert.
 */
export function parseEntitlementPublicKeys(raw: unknown): Record<string, string> {
  let value: unknown = raw
  if (typeof value === 'string') {
    if (!value.trim()) return {}
    try {
      value = JSON.parse(value)
    }
    catch {
      return {}
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as Record<string, string>
}

function base64urlDecode(segment: string): Buffer | null {
  if (!/^[\w-]+$/.test(segment)) return null
  try {
    return Buffer.from(segment, 'base64url')
  }
  catch {
    return null
  }
}

function parsePayload(raw: unknown): EntitlementPayload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const p = raw as Record<string, unknown>
  if (p.v !== ENTITLEMENT_DOC_VERSION) return null
  if (typeof p.kid !== 'string' || typeof p.siteProjectId !== 'string') return null
  if (!Array.isArray(p.features) || !p.features.every(f => typeof f === 'string')) return null
  if (typeof p.suspended !== 'boolean') return null
  for (const field of ['issuedAt', 'validUntil', 'graceUntil']) {
    if (typeof p[field] !== 'string' || Number.isNaN(Date.parse(p[field] as string))) return null
  }
  return p as unknown as EntitlementPayload
}

/**
 * Dokument prüfen: Format, bekannte kid, Ed25519-Signatur, Site-Bindung,
 * issuedAt nicht aus der Zukunft (±Skew). Ablauf ist hier bewusst KEIN
 * Fehler — den bewertet evaluateEntitlement (Grace-Semantik).
 */
export function verifyEntitlementDocument(
  document: string,
  publicKeys: Record<string, string>,
  expectedSiteProjectId: string,
  now: number = Date.now(),
): VerifyResult {
  const segments = document.trim().split('.')
  if (segments.length !== 2) return { ok: false, reason: 'format' }
  const [payloadSegment, signatureSegment] = segments as [string, string]

  const payloadBytes = base64urlDecode(payloadSegment)
  const signature = base64urlDecode(signatureSegment)
  if (!payloadBytes || !signature) return { ok: false, reason: 'format' }

  let payload: EntitlementPayload | null
  try {
    payload = parsePayload(JSON.parse(payloadBytes.toString('utf8')))
  }
  catch {
    return { ok: false, reason: 'payload' }
  }
  if (!payload) return { ok: false, reason: 'payload' }

  const publicKeyB64 = publicKeys[payload.kid]
  if (!publicKeyB64) return { ok: false, reason: `unknown kid ${payload.kid}` }

  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' })
    if (!cryptoVerify(null, Buffer.from(payloadSegment, 'utf8'), key, signature)) {
      return { ok: false, reason: 'signature' }
    }
  }
  catch {
    return { ok: false, reason: 'signature' }
  }

  if (payload.siteProjectId !== expectedSiteProjectId) {
    return { ok: false, reason: 'site mismatch' }
  }
  if (Date.parse(payload.issuedAt) > now + CLOCK_SKEW_MS) {
    return { ok: false, reason: 'issued in the future' }
  }
  return { ok: true, payload }
}

/**
 * Entscheidet für EIN Feature, ob das Entitlement es zulässt.
 *  - payload null (kein/nie ein Dokument) → neutral AN (Einführungs-
 *    sicherheit: Enforcement beginnt erst mit dem ersten gültigen Dokument).
 *  - foundation-Tier → immer AN (nicht entitlement-geschaltet).
 *  - suspended → AUS · jenseits graceUntil (+Skew) → AUS ·
 *    sonst: Key muss im Dokument stehen.
 */
export function evaluateEntitlement(
  payload: EntitlementPayload | null,
  featureKey: string,
  tier: 'foundation' | 'optional',
  now: number = Date.now(),
): boolean {
  if (tier === 'foundation') return true
  if (!payload) return true
  if (payload.suspended) return false
  if (now > Date.parse(payload.graceUntil) + CLOCK_SKEW_MS) return false
  return payload.features.includes(featureKey)
}
