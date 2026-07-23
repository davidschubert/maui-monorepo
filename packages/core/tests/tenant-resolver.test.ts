import { describe, expect, it } from 'vitest'
import { normalizeHost } from '../server/utils/tenantResolver'

/**
 * Naht 1 — pure Host-Normalisierung: der Resolver bekommt IMMER einen
 * kanonischen Host (klein, ohne Port/trailing dot), damit die tenants-Quelle
 * der Platform-App keine Varianten kennen muss.
 */
describe('normalizeHost', () => {
  it('lowercased und strippt den Port', () => {
    expect(normalizeHost('Kunde-A.pukalani.app:443')).toBe('kunde-a.pukalani.app')
    expect(normalizeHost('LOCALHOST:3004')).toBe('localhost')
  })

  it('entfernt trailing dot (FQDN-Form)', () => {
    expect(normalizeHost('kunde-a.pukalani.app.')).toBe('kunde-a.pukalani.app')
  })

  it('lässt IPv6-Literale intakt (Port folgt nach der Klammer)', () => {
    expect(normalizeHost('[::1]:3000')).toBe('[::1]')
    expect(normalizeHost('[2001:db8::1]')).toBe('[2001:db8::1]')
  })

  it('leer/fehlend → \'\' (Entscheidung liegt beim Resolver)', () => {
    expect(normalizeHost(undefined)).toBe('')
    expect(normalizeHost(null)).toBe('')
    expect(normalizeHost('  ')).toBe('')
  })
})
