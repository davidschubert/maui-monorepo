import { describe, expect, it } from 'vitest'
import {
  MESSAGE_REPORT_REASONS,
  REPORT_EVIDENCE_RETENTION_DAYS,
  evidenceStillProtected,
  moderatorVisibleBody,
  shouldFreezeSnapshot,
} from '../shared/messageReport'
import { MESSAGES_ENABLED_DEFAULT, messagesEnabledFrom } from '../shared/messageSettings'

/**
 * DER EINGEFRORENE BELEG (Konzept § 2.2, Davids Entscheidung 2).
 *
 * Die Zusage: die Moderation sieht GENAU die gemeldete Nachricht, so wie sie
 * im Moment der Meldung dastand — und sonst nichts. Zwei Fehler wären hier
 * unsichtbar und teuer:
 *  - Jede Meldung überschreibt den Beleg ⇒ eine zweite Meldung Stunden später
 *    machte die erste wertlos.
 *  - Ohne Beleg ersatzweise den LEBENDEN Text zeigen ⇒ genau die Hintertür,
 *    durch die eine ungemeldete Nachricht herauskäme.
 */
describe('Einfrieren', () => {
  it('schreibt bei der ERSTEN Meldung', () => {
    expect(shouldFreezeSnapshot({ reportedBody: '', reportedAt: '' })).toBe(true)
  })

  it('schreibt bei jeder weiteren NICHT', () => {
    expect(shouldFreezeSnapshot({ reportedBody: 'alt', reportedAt: '2026-08-05T10:00:00.000Z' })).toBe(false)
  })

  it('erkennt einen leeren Text als gültigen Beleg', () => {
    // Eine leere Nachricht kann es nicht geben (Zod verlangt Inhalt) — aber
    // wenn `reportedAt` steht, IST eingefroren worden. Der Zeitstempel ist der
    // Merker, nicht der Text.
    expect(shouldFreezeSnapshot({ reportedBody: '', reportedAt: '2026-08-05T10:00:00.000Z' })).toBe(false)
  })
})

describe('was die Moderation sieht', () => {
  it('gibt ohne Beleg NICHTS — auch nicht ersatzweise', () => {
    expect(moderatorVisibleBody({ reportedBody: '', reportedAt: '' })).toBeNull()
    // Auch dann nicht, wenn zufällig etwas in der Kopie steht, aber der
    // Zeitstempel fehlt: kein Zeitstempel heißt „nie gemeldet".
    expect(moderatorVisibleBody({ reportedBody: 'Text', reportedAt: '' })).toBeNull()
  })

  it('gibt die KOPIE, wenn eingefroren wurde', () => {
    expect(moderatorVisibleBody({ reportedBody: 'gemeldet', reportedAt: '2026-08-05T10:00:00.000Z' }))
      .toBe('gemeldet')
  })
})

describe('90-Tage-Schutz des Belegs (§ 6, Ausnahme 1)', () => {
  const now = new Date('2026-08-05T12:00:00.000Z')

  it('schützt einen frischen Beleg', () => {
    expect(REPORT_EVIDENCE_RETENTION_DAYS).toBe(90)
    expect(evidenceStillProtected('2026-08-01T12:00:00.000Z', now)).toBe(true)
  })

  it('lässt einen alten fallen', () => {
    expect(evidenceStillProtected('2026-01-01T12:00:00.000Z', now)).toBe(false)
  })

  it('schützt nichts, was nie gemeldet wurde', () => {
    expect(evidenceStillProtected('', now)).toBe(false)
    expect(evidenceStillProtected('kein Datum', now)).toBe(false)
  })
})

describe('Melde-Gründe', () => {
  it('nennt Belästigung zuerst — sie ist hier der Regelfall', () => {
    expect(MESSAGE_REPORT_REASONS[0]).toBe('harassment')
    expect([...MESSAGE_REPORT_REASONS]).toEqual(['harassment', 'spam', 'inappropriate', 'other'])
  })
})

describe('Owner-Schalter (Davids Entscheidung 4)', () => {
  it('ist ab Werk AUS', () => {
    expect(MESSAGES_ENABLED_DEFAULT).toBe(false)
    expect(messagesEnabledFrom(null)).toBe(false)
    expect(messagesEnabledFrom(undefined)).toBe(false)
    expect(messagesEnabledFrom({})).toBe(false)
  })

  it('ist fail-closed gegen alles, was nicht ausdrücklich `true` ist', () => {
    // Ein geratenes „an" wäre ein privater Kanal, dem niemand zugestimmt hat.
    expect(messagesEnabledFrom({ enabled: 'true' })).toBe(false)
    expect(messagesEnabledFrom({ enabled: 1 })).toBe(false)
    expect(messagesEnabledFrom({ enabled: null })).toBe(false)
    expect(messagesEnabledFrom({ enabled: true })).toBe(true)
  })
})
