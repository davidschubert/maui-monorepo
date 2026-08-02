import { describe, expect, it } from 'vitest'
import {
  PAST_DUE_GRACE_DAYS,
  shouldLiftBillingSuspension,
  shouldSuspendForPastDue,
  type CommunityBillingState,
} from '../shared/communityBilling'

/**
 * Zahlungsverzug → Sperre (M13, Auslöser 2), festgenagelt.
 *
 * Die Zeit wird INJIZIERT (`now`), nicht gemessen: eine Frist von vierzehn Tagen
 * lässt sich sonst nicht deterministisch prüfen, und ein Test, der nur an einem
 * bestimmten Kalendertag grün ist, beweist nichts.
 */
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-08-20T12:00:00.000Z')

function community(overrides: Partial<CommunityBillingState> = {}): CommunityBillingState {
  return {
    status: 'active',
    billingStatus: 'past_due',
    suspension: '',
    pastDueSince: new Date(NOW - 20 * DAY).toISOString(),
    ...overrides,
  }
}

describe('shouldSuspendForPastDue', () => {
  it('sperrt, wenn die Frist abgelaufen ist', () => {
    expect(shouldSuspendForPastDue(community(), NOW)).toBe(true)
  })

  it('sperrt am letzten Tag NICHT und am Stichtag doch', () => {
    const justBefore = new Date(NOW - (PAST_DUE_GRACE_DAYS * DAY) + 1).toISOString()
    const exactly = new Date(NOW - PAST_DUE_GRACE_DAYS * DAY).toISOString()
    expect(shouldSuspendForPastDue(community({ pastDueSince: justBefore }), NOW)).toBe(false)
    expect(shouldSuspendForPastDue(community({ pastDueSince: exactly }), NOW)).toBe(true)
  })

  it('rührt eine bestehende Sperre NIE an', () => {
    // Sonst stufte der Sweep eine abuse-Sperre stillschweigend auf „nur-lesend"
    // herunter und brächte eine gesperrte Community zurück ins Netz.
    expect(shouldSuspendForPastDue(community({ suspension: 'abuse' }), NOW)).toBe(false)
    expect(shouldSuspendForPastDue(community({ suspension: 'billing' }), NOW)).toBe(false)
  })

  it('lässt eine stillgelegte Community in Ruhe — die ist schon offline', () => {
    expect(shouldSuspendForPastDue(community({ status: 'disabled' }), NOW)).toBe(false)
  })

  it('sperrt nur bei past_due — nicht bei bezahlt, gekündigt oder nie gehabt', () => {
    for (const billingStatus of ['active', 'canceled', '']) {
      expect(shouldSuspendForPastDue(community({ billingStatus }), NOW), billingStatus).toBe(false)
    }
  })

  it('sperrt ohne Stempel nicht — und bei unlesbarem Datum auch nicht (fail-open)', () => {
    expect(shouldSuspendForPastDue(community({ pastDueSince: null }), NOW)).toBe(false)
    expect(shouldSuspendForPastDue(community({ pastDueSince: 'gestern' }), NOW)).toBe(false)
  })
})

describe('shouldLiftBillingSuspension', () => {
  it('hebt auf, sobald kein Verzug mehr besteht', () => {
    expect(shouldLiftBillingSuspension({ suspension: 'billing', billingStatus: 'active' })).toBe(true)
    expect(shouldLiftBillingSuspension({ suspension: 'billing', billingStatus: 'canceled' })).toBe(true)
  })

  it('lässt eine laufende Mahnung stehen', () => {
    expect(shouldLiftBillingSuspension({ suspension: 'billing', billingStatus: 'past_due' })).toBe(false)
  })

  it('rührt eine abuse-Sperre nie an — die endet nur durch eine Betreiber-Entscheidung', () => {
    expect(shouldLiftBillingSuspension({ suspension: 'abuse', billingStatus: 'active' })).toBe(false)
  })

  it('tut bei einer ungesperrten Community nichts', () => {
    expect(shouldLiftBillingSuspension({ suspension: '', billingStatus: 'active' })).toBe(false)
  })
})
