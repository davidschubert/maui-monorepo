import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createGuestCommentSchema } from '../schemas/comment'
import { GUEST_AUTHOR_RETENTION_DAYS, shouldPruneGuestAuthor } from '../server/utils/guestAuthorPrune'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-08-01T12:00:00.000Z')

const guestRouteSource = readFileSync(
  fileURLToPath(new URL('../server/api/comments/guest.post.ts', import.meta.url)),
  'utf8',
)

/**
 * Gast-Kontaktdaten: wer handelt beim Gast-Kommentar, und wie lange bleibt
 * seine Adresse liegen (Audit-Befunde 2026-08-01)?
 */
describe('Gast-Kommentar: Inhalt ja, Mitgliedschaft nein', () => {
  it('handelt als GAST — die Klinke sagt nur, dass keine Sitzung da ist', () => {
    expect(guestRouteSource).toContain('{ as: \'operator\', actor: \'guest\' }')
    // Nicht 'member': das würde einen Beitritt für jemanden auslösen, der kein
    // Konto hat — und wäre bei einem angemeldeten Nutzer auf dem Gast-Weg sogar
    // eine Mitgliedschaft, die er nie beantragt hat.
    expect(guestRouteSource).not.toContain('actor: \'member\'')
  })
})

/**
 * F18 (Davids Entscheidung 2026-08-02): die Kontaktdaten werden NICHT MEHR
 * ERHOBEN. Der Beweis hängt an drei Stellen, weil die Erhebung an dreien hing —
 * Formularvertrag (Schema), Route (Schreibvorgang) und Transport (kein Feld,
 * das man versehentlich wieder durchreicht).
 */
describe('F18 — von einem Gast bleibt nur der Anzeigename', () => {
  const schema = createGuestCommentSchema()

  it('das Schema kennt guestEmail nicht mehr', () => {
    expect(Object.keys(schema.shape)).toContain('guestName')
    expect(Object.keys(schema.shape)).not.toContain('guestEmail')
  })

  it('ein alter Client mit guestEmail bekommt kein 400 — das Feld wird verworfen', () => {
    // Widgets liegen im Browser-Cache fremder Einbetter. `.strict()` hier hieße:
    // jeder noch nicht neu geladene Einbetter kann bis zum Cache-Ablauf gar
    // nicht mehr kommentieren. Zod strippt stattdessen — die Adresse erreicht
    // den Server, wird aber nirgends verwendet und nirgends abgelegt.
    const parsed = schema.parse({
      targetId: 't1', targetType: 'post', content: 'hallo', guestName: 'Gast',
      guestEmail: 'alt@example.com',
    })
    expect(parsed).not.toHaveProperty('guestEmail')
    expect(parsed.guestName).toBe('Gast')
  })

  it('die Route schreibt nichts mehr in guest_authors', () => {
    expect(guestRouteSource).not.toContain('GUEST_AUTHORS_TABLE')
    // Kein IP-Hash mehr: er existierte ausschließlich für diese Zeile.
    expect(guestRouteSource).not.toContain('createHash')
    expect(guestRouteSource).not.toContain('trustedClientIp')
    expect(guestRouteSource).not.toContain('guestEmail')
  })
})

describe('shouldPruneGuestAuthor — 90 Tage, dann fällt die Zeile', () => {
  const aged = (ms: number) => ({ $createdAt: new Date(NOW - ms).toISOString() })

  it('die Frist ist dieselbe wie bei den Melder-Adressen', () => {
    // EINE Zusage statt zweier: „Kontaktdaten ohne Konto leben höchstens
    // 90 Tage."
    expect(GUEST_AUTHOR_RETENTION_DAYS).toBe(90)
  })

  it('genau auf der Frist ist fällig, eine Minute davor nicht', () => {
    expect(shouldPruneGuestAuthor(aged(GUEST_AUTHOR_RETENTION_DAYS * DAY), NOW)).toBe(true)
    expect(shouldPruneGuestAuthor(aged(GUEST_AUTHOR_RETENTION_DAYS * DAY - 60_000), NOW)).toBe(false)
  })

  it('frische Zeilen bleiben', () => {
    expect(shouldPruneGuestAuthor(aged(DAY), NOW)).toBe(false)
  })

  it('ohne lesbaren Zeitstempel wird NICHT gelöscht', () => {
    // Fail-safe wie im Melder-Sweep: ein unparsbares Datum als „unendlich alt"
    // zu lesen wäre die teure Richtung des Zweifels.
    expect(shouldPruneGuestAuthor({}, NOW)).toBe(false)
    expect(shouldPruneGuestAuthor({ $createdAt: '' }, NOW)).toBe(false)
    expect(shouldPruneGuestAuthor({ $createdAt: 'vorgestern' }, NOW)).toBe(false)
  })
})
