import { describe, expect, it } from 'vitest'
import { resolveClientIp } from '../server/utils/clientIp'

/**
 * Sicherheits-Audit 2026-08-02 (HOCH): `getRequestIP(event, { xForwardedFor: true })`
 * nimmt das ERSTE X-Forwarded-For-Segment, unsere nginx-Vorlage setzt aber
 * `$proxy_add_x_forwarded_for` — die echte IP wird ANGEHÄNGT. Ein Client konnte
 * damit pro Request einen frischen Rate-Limit-Bucket erfinden (Login-Brute-Force)
 * und die IP in seinem eigenen Protokolleintrag bestimmen.
 *
 * Vertrauenswürdig ist das LETZTE Segment: das hat unser eigener Proxy gesetzt.
 */
describe('resolveClientIp (Trust-Proxy-Regel)', () => {
  it('ohne X-Forwarded-For: die Socket-Adresse', () => {
    expect(resolveClientIp(undefined, '203.0.113.7')).toBe('203.0.113.7')
    expect(resolveClientIp('', '203.0.113.7')).toBe('203.0.113.7')
    expect(resolveClientIp(null, '::1')).toBe('::1')
  })

  it('EIN Segment (nginx ohne vorgelagerten Proxy): genau dieses', () => {
    expect(resolveClientIp('203.0.113.7', '127.0.0.1')).toBe('203.0.113.7')
  })

  it('MEHRERE Segmente: das LETZTE — das ist das von unserem nginx angehängte', () => {
    expect(resolveClientIp('198.51.100.1, 203.0.113.7', '127.0.0.1')).toBe('203.0.113.7')
    expect(resolveClientIp('a, b, 203.0.113.7', '127.0.0.1')).toBe('203.0.113.7')
  })

  it('GEFÄLSCHTES erstes Segment ändert nichts (der eigentliche Befund)', () => {
    // Client schickt `X-Forwarded-For: 1.2.3.4`; nginx macht daraus
    // `1.2.3.4, <echte IP>`. Früher gelesen: 1.2.3.4.
    const spoofed = '1.2.3.4, 203.0.113.7'
    expect(resolveClientIp(spoofed, '127.0.0.1')).toBe('203.0.113.7')
    // Und auch eine lange erfundene Kette hilft nicht weiter.
    expect(resolveClientIp('9.9.9.1, 9.9.9.2, 9.9.9.3, 203.0.113.7', '127.0.0.1')).toBe('203.0.113.7')
  })

  it('jeder erfundene Header liefert DENSELBEN Bucket — kein frisches Budget je Request', () => {
    const real = '203.0.113.7'
    const attempts = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map(fake => resolveClientIp(`${fake}, ${real}`, '127.0.0.1'))
    expect(new Set(attempts)).toEqual(new Set([real]))
  })

  it('Leerraum und leere Segmente werden weggeworfen', () => {
    expect(resolveClientIp('  198.51.100.1 ,  203.0.113.7  ', '127.0.0.1')).toBe('203.0.113.7')
    expect(resolveClientIp('203.0.113.7, , ', '127.0.0.1')).toBe('203.0.113.7')
    expect(resolveClientIp(' , ', '203.0.113.9')).toBe('203.0.113.9')
  })

  it('gar nichts Brauchbares → leer (der Aufrufer entscheidet)', () => {
    expect(resolveClientIp(undefined, undefined)).toBe('')
    expect(resolveClientIp('', '')).toBe('')
  })
})
