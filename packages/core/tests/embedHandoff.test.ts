import { describe, expect, it } from 'vitest'
import { deriveHandoffKey, HANDOFF_TTL_MS, openHandoffToken, sealHandoffToken } from '../server/utils/embedHandoff'

const key = deriveHandoffKey('test-server-secret')

describe('embedHandoff (E2 Popup→iframe Session-Übergabe)', () => {
  it('Roundtrip: seal → open liefert das Secret', () => {
    const token = sealHandoffToken('session-secret-123', key)
    expect(openHandoffToken(token, key)).toBe('session-secret-123')
  })
  it('abgelaufenes Token → null', () => {
    const now = 1_000_000
    const token = sealHandoffToken('s', key, now)
    expect(openHandoffToken(token, key, now + HANDOFF_TTL_MS - 1)).toBe('s')
    expect(openHandoffToken(token, key, now + HANDOFF_TTL_MS + 1)).toBeNull()
  })
  it('falscher Schlüssel → null (kein Throw)', () => {
    const token = sealHandoffToken('s', key)
    expect(openHandoffToken(token, deriveHandoffKey('anderes-secret'))).toBeNull()
  })
  it('manipuliertes Token → null', () => {
    const token = sealHandoffToken('s', key)
    const tampered = token.slice(0, -4) + (token.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(openHandoffToken(tampered, key)).toBeNull()
    expect(openHandoffToken('', key)).toBeNull()
    expect(openHandoffToken('nicht-base64!!!', key)).toBeNull()
  })
  it('jedes Token ist einzigartig (frische IV)', () => {
    expect(sealHandoffToken('s', key)).not.toBe(sealHandoffToken('s', key))
  })
})
