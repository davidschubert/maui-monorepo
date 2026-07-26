import { describe, expect, it } from 'vitest'
import { safeRedirectTarget } from '../shared/redirectTarget'

describe('Ziel nach der Anmeldung (?redirect=)', () => {
  it('nimmt einen Pfad auf diesem Host — mit Query', () => {
    expect(safeRedirectTarget('/start?code=MAUI-ABCD-2345')).toBe('/start?code=MAUI-ABCD-2345')
    expect(safeRedirectTarget('/de/start?code=X')).toBe('/de/start?code=X')
    expect(safeRedirectTarget('/dashboard/invites')).toBe('/dashboard/invites')
  })

  it('lässt keine fremde Domain zu — das wäre eine Phishing-Rutsche', () => {
    for (const evil of [
      'https://phishing.example',
      'http://phishing.example/start',
      '//phishing.example',
      '/\\phishing.example',
      'javascript:alert(1)',
      'data:text/html,<script>',
    ]) {
      expect(safeRedirectTarget(evil), evil).toBeNull()
    }
  })

  it('schickt niemanden zurück auf eine Anmeldeseite (Endlosschleife)', () => {
    for (const loop of ['/login', '/de/login', '/login?redirect=/start', '/register', '/de/reset-password']) {
      expect(safeRedirectTarget(loop), loop).toBeNull()
    }
  })

  it('lehnt Steuerzeichen und Unsinn ab', () => {
    expect(safeRedirectTarget('/start\nSet-Cookie: a=b')).toBeNull()
    expect(safeRedirectTarget('')).toBeNull()
    expect(safeRedirectTarget('   ')).toBeNull()
    expect(safeRedirectTarget(undefined)).toBeNull()
    expect(safeRedirectTarget(42)).toBeNull()
    expect(safeRedirectTarget(['/start'])).toBeNull()
  })
})
