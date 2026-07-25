import { describe, expect, it } from 'vitest'
import {
  REMINDER_MAX,
  evaluateReminder,
  summarizeRequests,
} from '../shared/types/inviteRequest'
import { evaluateInviteCode, inviteCodeState, summarizeStock } from '../shared/types/inviteCode'
import { shouldPruneRequest } from '../server/utils/inviteRequestPrune'

const NOW = Date.parse('2026-08-01T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const assigned = {
  status: 'assigned' as const,
  assignedAt: new Date(NOW - 5 * DAY).toISOString(),
  reminders: 0,
  lastReminderAt: null,
}

describe('Erinnern: darf ich, und wäre es sinnvoll?', () => {
  it('erlaubt die erste Erinnerung an eine zugewiesene Anfrage', () => {
    expect(evaluateReminder(assigned, NOW)).toEqual({ allowed: true, suggested: true })
  })

  it('erinnert nicht an etwas, das noch nicht zugewiesen ist', () => {
    expect(evaluateReminder({ ...assigned, status: 'new' }, NOW))
      .toEqual({ allowed: false, reason: 'not-assigned', suggested: false })
  })

  it('erinnert nie an eine eingelöste Anfrage', () => {
    expect(evaluateReminder({ ...assigned, status: 'redeemed' }, NOW))
      .toEqual({ allowed: false, reason: 'already-redeemed', suggested: false })
  })

  it('hält 24 Stunden Abstand', () => {
    const justReminded = { ...assigned, reminders: 1, lastReminderAt: new Date(NOW - 3 * HOUR).toISOString() }
    expect(evaluateReminder(justReminded, NOW).allowed).toBe(false)
    expect(evaluateReminder(justReminded, NOW).reason).toBe('cooldown')
    const dayLater = { ...justReminded, lastReminderAt: new Date(NOW - 25 * HOUR).toISOString() }
    expect(evaluateReminder(dayLater, NOW).allowed).toBe(true)
  })

  it('hört nach drei Erinnerungen auf', () => {
    const exhausted = { ...assigned, reminders: REMINDER_MAX, lastReminderAt: new Date(NOW - 10 * DAY).toISOString() }
    expect(evaluateReminder(exhausted, NOW)).toMatchObject({ allowed: false, reason: 'limit' })
  })

  it('schlägt frisch Zugewiesenes NICHT sofort vor (Knopf bleibt aber nutzbar)', () => {
    // Jemand ruft direkt an, weil die Mail im Spam lag — erlaubt, nur nicht
    // hervorgehoben.
    const fresh = { ...assigned, assignedAt: new Date(NOW - 2 * HOUR).toISOString() }
    expect(evaluateReminder(fresh, NOW)).toEqual({ allowed: true, suggested: false })
  })

  it('hört nach einer Erinnerung auf zu leuchten', () => {
    const reminded = { ...assigned, reminders: 1, lastReminderAt: new Date(NOW - 2 * DAY).toISOString() }
    expect(evaluateReminder(reminded, NOW).suggested).toBe(false)
  })

  it('verträgt fehlende Zeitstempel', () => {
    expect(evaluateReminder({ ...assigned, assignedAt: null, lastReminderAt: null }, NOW).allowed).toBe(true)
  })
})

describe('An eine Adresse gebundene Codes', () => {
  const bound = { status: 'active' as const, expiresAt: '', maxUses: 1, uses: 0, boundEmail: 'anna@example.test' }

  it('gilt für die Adresse, für die er ausgestellt wurde', () => {
    expect(evaluateInviteCode(bound, NOW, 'anna@example.test')).toEqual({ valid: true })
  })

  it('ignoriert Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(evaluateInviteCode(bound, NOW, '  Anna@Example.Test ')).toEqual({ valid: true })
  })

  it('ist für jede ANDERE Adresse wertlos — weiterleiten bringt nichts', () => {
    expect(evaluateInviteCode(bound, NOW, 'bob@example.test'))
      .toEqual({ valid: false, reason: 'wrong_email' })
  })

  it('greift ohne bekannte Adresse gar nicht', () => {
    expect(evaluateInviteCode(bound, NOW)).toEqual({ valid: false, reason: 'wrong_email' })
  })

  it('lässt ungebundene Codes weiter für alle gelten (Betreiber-Weg)', () => {
    const bearer = { status: 'active' as const, expiresAt: '', maxUses: 1, uses: 0, boundEmail: '' }
    expect(evaluateInviteCode(bearer, NOW, 'wer@example.test')).toEqual({ valid: true })
    expect(evaluateInviteCode(bearer, NOW)).toEqual({ valid: true })
  })

  it('prüft die Bindung VOR Ablauf und Verbrauch', () => {
    // Reihenfolge zählt fürs Log: „falsche Adresse" ist ein anderer Vorgang
    // als „Code aufgebraucht".
    const usedUp = { ...bound, uses: 1 }
    expect(evaluateInviteCode(usedUp, NOW, 'bob@example.test').reason).toBe('wrong_email')
    expect(evaluateInviteCode(usedUp, NOW, 'anna@example.test').reason).toBe('exhausted')
  })
})

describe('Vorrat: was ist frei, unterwegs, angekommen?', () => {
  const free = { status: 'active' as const, expiresAt: '', boundEmail: '', uses: 0 }

  it('zählt die Zustände auseinander', () => {
    const summary = summarizeStock([
      free,
      { ...free, boundEmail: 'a@example.test' },
      { ...free, boundEmail: 'b@example.test', redeemedAt: new Date(NOW - DAY).toISOString() },
      { ...free, expiresAt: new Date(NOW - DAY).toISOString() },
      { ...free, status: 'revoked' as const },
    ], NOW)
    expect(summary).toEqual({ total: 5, free: 1, assigned: 1, redeemed: 1, expired: 1, revoked: 1 })
  })

  it('lässt eingelöst eingelöst bleiben — auch nach Ablauf', () => {
    // Sonst verschwände ein Erfolg aus der Statistik, nur weil Zeit vergeht.
    const redeemedThenExpired = {
      ...free,
      boundEmail: 'a@example.test',
      redeemedAt: new Date(NOW - 30 * DAY).toISOString(),
      expiresAt: new Date(NOW - 10 * DAY).toISOString(),
    }
    expect(inviteCodeState(redeemedThenExpired, NOW)).toBe('redeemed')
  })

  it('erkennt einen verbrauchten Code auch ohne Zeitstempel als eingelöst', () => {
    expect(inviteCodeState({ ...free, uses: 1 }, NOW)).toBe('redeemed')
  })
})

describe('Aufräumen erledigter Anfragen', () => {
  it('löscht Abgelehntes nach 30 und Eingelöstes nach 90 Tagen', () => {
    expect(shouldPruneRequest({ status: 'declined', redeemedAt: null, $updatedAt: new Date(NOW - 31 * DAY).toISOString() }, NOW)).toBe(true)
    expect(shouldPruneRequest({ status: 'declined', redeemedAt: null, $updatedAt: new Date(NOW - 10 * DAY).toISOString() }, NOW)).toBe(false)
    expect(shouldPruneRequest({ status: 'redeemed', redeemedAt: new Date(NOW - 91 * DAY).toISOString() }, NOW)).toBe(true)
    expect(shouldPruneRequest({ status: 'redeemed', redeemedAt: new Date(NOW - 60 * DAY).toISOString() }, NOW)).toBe(false)
  })

  it('rührt nichts an, wo jemand auf Antwort wartet', () => {
    const old = new Date(NOW - 400 * DAY).toISOString()
    for (const status of ['new', 'assigned', 'deferred'] as const) {
      expect(shouldPruneRequest({ status, redeemedAt: null, $updatedAt: old }, NOW), status).toBe(false)
    }
  })

  it('löscht nichts ohne verlässlichen Zeitstempel', () => {
    expect(shouldPruneRequest({ status: 'declined', redeemedAt: null }, NOW)).toBe(false)
    expect(shouldPruneRequest({ status: 'declined', redeemedAt: null, $updatedAt: 'irgendwann' }, NOW)).toBe(false)
  })
})

describe('Kennzahlen der Warteschlange', () => {
  it('zählt je Zustand und weist „wartet auf Einlösung" aus', () => {
    const stats = summarizeRequests([
      { status: 'new' }, { status: 'new' },
      { status: 'assigned' }, { status: 'assigned' }, { status: 'assigned' },
      { status: 'redeemed' },
      { status: 'declined' },
      { status: 'deferred' },
    ])
    expect(stats).toMatchObject({ total: 8, new: 2, assigned: 3, redeemed: 1, declined: 1, deferred: 1, waiting: 3 })
  })

  it('behandelt leere Zustände als neu und verträgt eine leere Liste', () => {
    expect(summarizeRequests([{ status: '' }])).toMatchObject({ total: 1, new: 1 })
    expect(summarizeRequests([])).toMatchObject({ total: 0, waiting: 0 })
  })
})
