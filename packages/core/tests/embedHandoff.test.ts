import { describe, expect, it } from 'vitest'
import { deriveHandoffKey, HANDOFF_TTL_MS, handoffAudience, openHandoffToken, sealHandoffToken } from '../server/utils/embedHandoff'

const key = deriveHandoffKey('test-server-secret')
const HOST = 'kunde-a.pukalani.app'

describe('embedHandoff (Session-Übergabe: Popup→iframe und Kontroll-Host→Community)', () => {
  it('Roundtrip: seal → open liefert das Secret', () => {
    const token = sealHandoffToken('session-secret-123', key, HOST)
    expect(openHandoffToken(token, key, HOST)).toBe('session-secret-123')
  })
  it('abgelaufenes Token → null', () => {
    const now = 1_000_000
    const token = sealHandoffToken('s', key, HOST, now)
    expect(openHandoffToken(token, key, HOST, now + HANDOFF_TTL_MS - 1)).toBe('s')
    expect(openHandoffToken(token, key, HOST, now + HANDOFF_TTL_MS + 1)).toBeNull()
  })
  it('falscher Schlüssel → null (kein Throw)', () => {
    const token = sealHandoffToken('s', key, HOST)
    expect(openHandoffToken(token, deriveHandoffKey('anderes-secret'), HOST)).toBeNull()
  })
  it('manipuliertes Token → null', () => {
    const token = sealHandoffToken('s', key, HOST)
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(openHandoffToken(tampered, key, HOST)).toBeNull()
    expect(openHandoffToken('', key, HOST)).toBeNull()
    expect(openHandoffToken('nicht-base64!!!', key, HOST)).toBeNull()
  })
  it('jedes Token ist einzigartig (frische IV)', () => {
    expect(sealHandoffToken('s', key, HOST)).not.toBe(sealHandoffToken('s', key, HOST))
  })
})

/**
 * Der Kern des Audit-Fixes vom 2026-08-02 (KRITISCH, Kontoübernahme): ein
 * Siegel für Host A darf auf Host B NICHTS öffnen. Vorher trug es keinen
 * Ziel-Host, und jeder Host des Deployments löste jedes Token ein.
 */
describe('embedHandoff — Bindung an den Ziel-Host', () => {
  it('ein Siegel für Host A öffnet auf Host B NICHT', () => {
    const token = sealHandoffToken('s', key, 'kunde-a.pukalani.app')
    expect(openHandoffToken(token, key, 'kunde-a.pukalani.app')).toBe('s')
    expect(openHandoffToken(token, key, 'kunde-b.pukalani.app')).toBeNull()
    expect(openHandoffToken(token, key, 'angreifer.example')).toBeNull()
  })

  it('normalisiert beide Seiten gleich (Groß-/Kleinschreibung, Port, Punkt am Ende)', () => {
    const token = sealHandoffToken('s', key, 'Kunde-A.Pukalani.app:443')
    expect(openHandoffToken(token, key, 'kunde-a.pukalani.app')).toBe('s')
    expect(openHandoffToken(token, key, 'KUNDE-A.PUKALANI.APP.')).toBe('s')
    expect(openHandoffToken(token, key, 'kunde-a.pukalani.app:3006')).toBe('s')
  })

  it('ein Sub-/Superstring des Hosts genügt nicht', () => {
    const token = sealHandoffToken('s', key, 'kunde.pukalani.app')
    expect(openHandoffToken(token, key, 'kunde.pukalani.app.evil.example')).toBeNull()
    expect(openHandoffToken(token, key, 'pukalani.app')).toBeNull()
    expect(openHandoffToken(token, key, 'xkunde.pukalani.app')).toBeNull()
  })

  it('ohne Zielgruppe geht gar nichts — auf beiden Seiten', () => {
    expect(() => sealHandoffToken('s', key, '')).toThrow()
    const token = sealHandoffToken('s', key, HOST)
    expect(openHandoffToken(token, key, '')).toBeNull()
    expect(openHandoffToken(token, key, '   ')).toBeNull()
  })

  it('handoffAudience ist dieselbe Normalisierung wie die Mandanten-Auflösung', () => {
    expect(handoffAudience('Kunde-A.Pukalani.app:3006')).toBe('kunde-a.pukalani.app')
    expect(handoffAudience(undefined)).toBe('')
    expect(handoffAudience('')).toBe('')
  })
})
