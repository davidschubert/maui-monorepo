import { describe, expect, it } from 'vitest'
import { stripPersonalMetadata } from '../../system/server/utils/userDataContributor'

/**
 * GDPR-Befund vom 2026-08-02: die E-Mail-Adresse überlebte die Kontolöschung.
 *
 * `POST /api/admin/users` schrieb sie als `metadata.email` ins Audit-Log; der
 * system-Contributor pseudonymisierte aber nur `actorName`, `ip` und
 * `metadata.name`. Nach `deleteUserCompletely` stand die Adresse als Klartext
 * in einer Zeile, deren Rest auf einen Menschen zeigte, den es nicht mehr gibt.
 *
 * Zwei Hälften, beide nötig: die Route speichert sie nicht mehr (dafür gibt es
 * keinen sinnvollen Unit-Test — die Abwesenheit eines Feldes prüft der
 * Codereview), und dieser Griff hier räumt den Bestand.
 */
describe('stripPersonalMetadata', () => {
  it('entfernt die E-Mail — der eigentliche Befund', () => {
    const before = JSON.stringify({ email: 'mail@davidschubert.com', roles: ['admin'] })
    expect(stripPersonalMetadata(before)).toBe(JSON.stringify({ roles: ['admin'] }))
  })

  it('entfernt weiterhin den Klarnamen (self_deleted)', () => {
    expect(stripPersonalMetadata(JSON.stringify({ name: 'David', count: 3 })))
      .toBe(JSON.stringify({ count: 3 }))
  })

  it('entfernt beide auf einmal', () => {
    const cleaned = JSON.parse(stripPersonalMetadata(JSON.stringify({
      name: 'David', email: 'mail@davidschubert.com', roles: ['editor'],
    }))) as Record<string, unknown>
    expect(cleaned).toEqual({ roles: ['editor'] })
  })

  it('leert das Feld ganz, wenn nur Personenbezug drinstand', () => {
    expect(stripPersonalMetadata(JSON.stringify({ email: 'weg@example.com' }))).toBe('')
    expect(stripPersonalMetadata(JSON.stringify({ name: 'David' }))).toBe('')
  })

  it('lässt unpersönliche metadata UNVERÄNDERT — der Idempotenz-Vergleich hängt daran', () => {
    const untouched = JSON.stringify({ roles: ['admin'], count: 2 })
    expect(stripPersonalMetadata(untouched)).toBe(untouched)
  })

  it('ist idempotent: ein zweiter Lauf ändert nichts mehr', () => {
    const once = stripPersonalMetadata(JSON.stringify({ email: 'a@b.de', roles: [] }))
    expect(stripPersonalMetadata(once)).toBe(once)
  })

  it('leert kaputtes JSON sicherheitshalber komplett', () => {
    expect(stripPersonalMetadata('{nicht wirklich json')).toBe('')
  })

  it('bleibt bei leerem Feld leer', () => {
    expect(stripPersonalMetadata('')).toBe('')
  })

  it('trifft die Felder nur auf oberster Ebene — verschachteltes bleibt (bewusst: keine Heuristik)', () => {
    const nested = JSON.stringify({ before: { email: 'a@b.de' } })
    expect(stripPersonalMetadata(nested)).toBe(nested)
  })
})
