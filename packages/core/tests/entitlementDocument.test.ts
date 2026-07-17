import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import {
  CLOCK_SKEW_MS,
  ENTITLEMENT_DOC_VERSION,
  evaluateEntitlement,
  parseEntitlementPublicKeys,
  verifyEntitlementDocument,
  type EntitlementPayload,
} from '../server/utils/entitlementDocument'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const publicKeyB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const KEYS = { k1: publicKeyB64 }

const NOW = Date.parse('2026-07-17T12:00:00Z')
const HOUR = 3_600_000

function makePayload(overrides: Partial<EntitlementPayload> = {}): EntitlementPayload {
  return {
    v: ENTITLEMENT_DOC_VERSION,
    kid: 'k1',
    siteProjectId: 'photos-qgry',
    features: ['media', 'comments', 'moderation'],
    suspended: false,
    issuedAt: new Date(NOW - HOUR).toISOString(),
    validUntil: new Date(NOW + 24 * HOUR).toISOString(),
    graceUntil: new Date(NOW + 7 * 24 * HOUR).toISOString(),
    ...overrides,
  }
}

function signDocument(payload: EntitlementPayload, key = privateKey): string {
  const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = cryptoSign(null, Buffer.from(segment, 'utf8'), key).toString('base64url')
  return `${segment}.${signature}`
}

describe('verifyEntitlementDocument', () => {
  it('akzeptiert ein korrekt signiertes Dokument', () => {
    const result = verifyEntitlementDocument(signDocument(makePayload()), KEYS, 'photos-qgry', NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.features).toContain('media')
  })

  it('lehnt manipulierte Payloads ab (Signatur)', () => {
    const doc = signDocument(makePayload())
    const [, signature] = doc.split('.')
    const forged = Buffer.from(JSON.stringify(makePayload({ features: ['media', 'billing'] })), 'utf8').toString('base64url')
    const result = verifyEntitlementDocument(`${forged}.${signature}`, KEYS, 'photos-qgry', NOW)
    expect(result).toEqual({ ok: false, reason: 'signature' })
  })

  it('lehnt fremde Schlüssel ab', () => {
    const other = generateKeyPairSync('ed25519')
    const result = verifyEntitlementDocument(signDocument(makePayload(), other.privateKey), KEYS, 'photos-qgry', NOW)
    expect(result).toEqual({ ok: false, reason: 'signature' })
  })

  it('lehnt unbekannte kid ab', () => {
    const result = verifyEntitlementDocument(signDocument(makePayload({ kid: 'k9' })), KEYS, 'photos-qgry', NOW)
    expect(result.ok).toBe(false)
  })

  it('bindet das Dokument an die Site (Projekt-ID)', () => {
    const result = verifyEntitlementDocument(signDocument(makePayload()), KEYS, 'andere-site', NOW)
    expect(result).toEqual({ ok: false, reason: 'site mismatch' })
  })

  it('lehnt Dokumente aus der Zukunft ab — mit Skew-Toleranz', () => {
    const future = signDocument(makePayload({ issuedAt: new Date(NOW + 10 * 60_000).toISOString() }))
    expect(verifyEntitlementDocument(future, KEYS, 'photos-qgry', NOW).ok).toBe(false)
    const withinSkew = signDocument(makePayload({ issuedAt: new Date(NOW + CLOCK_SKEW_MS - 1000).toISOString() }))
    expect(verifyEntitlementDocument(withinSkew, KEYS, 'photos-qgry', NOW).ok).toBe(true)
  })

  it('lehnt kaputte Formate ab, ohne zu werfen', () => {
    for (const raw of ['', 'nur-ein-segment', 'a.b.c', '!!.!!', `${Buffer.from('{}').toString('base64url')}.AAAA`]) {
      expect(verifyEntitlementDocument(raw, KEYS, 'photos-qgry', NOW).ok).toBe(false)
    }
  })

  it('abgelaufene Dokumente sind hier KEIN Fehler (Grace bewertet evaluate)', () => {
    const expired = signDocument(makePayload({ validUntil: new Date(NOW - HOUR).toISOString() }))
    expect(verifyEntitlementDocument(expired, KEYS, 'photos-qgry', NOW).ok).toBe(true)
  })
})

describe('parseEntitlementPublicKeys', () => {
  it('akzeptiert String UND Objekt (Nitro destr-t Env-Werte zu Objekten)', () => {
    expect(parseEntitlementPublicKeys('{"k1":"abc"}')).toEqual({ k1: 'abc' })
    expect(parseEntitlementPublicKeys({ k1: 'abc', k2: 'def' })).toEqual({ k1: 'abc', k2: 'def' })
  })

  it('fällt bei Müll auf leere Map zurück', () => {
    expect(parseEntitlementPublicKeys('')).toEqual({})
    expect(parseEntitlementPublicKeys('kein json')).toEqual({})
    expect(parseEntitlementPublicKeys(['a'])).toEqual({})
    expect(parseEntitlementPublicKeys({ k1: 42 })).toEqual({})
    expect(parseEntitlementPublicKeys(null)).toEqual({})
  })
})

describe('evaluateEntitlement', () => {
  const payload = makePayload()

  it('ohne Dokument: neutral AN (Einführungssicherheit)', () => {
    expect(evaluateEntitlement(null, 'media', 'optional', NOW)).toBe(true)
  })

  it('foundation-Tier ist nie entitlement-geschaltet', () => {
    expect(evaluateEntitlement(makePayload({ features: [] }), 'themes', 'foundation', NOW)).toBe(true)
    expect(evaluateEntitlement(makePayload({ suspended: true }), 'admin', 'foundation', NOW)).toBe(true)
  })

  it('optional-Tier folgt dem Dokument', () => {
    expect(evaluateEntitlement(payload, 'media', 'optional', NOW)).toBe(true)
    expect(evaluateEntitlement(payload, 'tickets', 'optional', NOW)).toBe(false)
  })

  it('suspended schaltet optionale Features ab', () => {
    expect(evaluateEntitlement(makePayload({ suspended: true }), 'media', 'optional', NOW)).toBe(false)
  })

  it('Grace: nach validUntil gilt last-known-good weiter, nach graceUntil ist Schluss', () => {
    const aged = makePayload({
      validUntil: new Date(NOW - 2 * HOUR).toISOString(),
      graceUntil: new Date(NOW + HOUR).toISOString(),
    })
    expect(evaluateEntitlement(aged, 'media', 'optional', NOW)).toBe(true)
    const beyondGrace = makePayload({
      validUntil: new Date(NOW - 8 * 24 * HOUR).toISOString(),
      graceUntil: new Date(NOW - HOUR).toISOString(),
    })
    expect(evaluateEntitlement(beyondGrace, 'media', 'optional', NOW)).toBe(false)
    // Skew-Toleranz auf graceUntil
    const justOver = makePayload({ graceUntil: new Date(NOW - CLOCK_SKEW_MS + 1000).toISOString() })
    expect(evaluateEntitlement(justOver, 'media', 'optional', NOW)).toBe(true)
  })
})
