import { describe, expect, it } from 'vitest'
import { lookupKeyAllowedBy, rejectOneTimeLookupKey } from '../shared/lookupKeys'
import type { PukalaniBillingPlan } from '../shared/types/billing'

/**
 * F21 (2026-08-03): die Einmal-Allowlist ist scharf gestellt — `event_ticket_*`
 * in apps/comments.
 *
 * Bis dahin galt für Event-Tickets nur „kein Plan-Key + der Stripe-Price muss
 * `one_time` sein". Der Ticket-Schlüssel ist aber ein FREITEXTFELD im
 * Dashboard: wer eine Community verwaltet, konnte damit auf jeden
 * Einmal-Preis des Stripe-Kontos zeigen — und dort liegt Fremdes aus anderen
 * Zusammenhängen.
 *
 * Der Test hält die Regel fest, die dabei am leichtesten kaputtgeht: ein
 * Präfix-Muster darf NICHT versehentlich alles erlauben.
 */
const PLANS: PukalaniBillingPlan[] = [
  { id: 'pro', labelKey: 'x', products: [], highlights: [], lookupKeys: { monthly: 'maui_pro_monthly', yearly: 'maui_pro_yearly' } },
]
const ALLOW = ['event_ticket_*']

describe('F21 — Einmal-Allowlist', () => {
  it('lässt Ticket-Schlüssel mit dem Präfix durch', () => {
    expect(rejectOneTimeLookupKey('event_ticket_sommerfest', PLANS, ALLOW)).toBeNull()
  })

  it('weist Fremdpreise ab — das ist der eigentliche Zweck', () => {
    // Ein realer Fall: im Stripe-Testkonto liegt ein Einmal-Preis über 599 €
    // aus einem anderen Zusammenhang. Bekäme er einen lookup_key, wäre er ohne
    // Liste über die Ticket-Route kaufbar.
    expect(rejectOneTimeLookupKey('beratungspaket', PLANS, ALLOW)).toBe('not_purchasable')
    expect(rejectOneTimeLookupKey('workspace_pro_monthly', PLANS, ALLOW)).toBe('not_purchasable')
  })

  it('weist einen ABO-Schlüssel ab, auch wenn die Liste ihn nennen würde', () => {
    // Reihenfolge zählt: der Plan-Key fliegt VOR der Allowlist raus, sonst
    // könnte eine schlampige Liste ein Abo als Einmalkauf öffnen.
    expect(rejectOneTimeLookupKey('maui_pro_monthly', PLANS, ['maui_pro_*'])).toBe('plan_key_in_one_time_checkout')
  })

  it('ein nacktes * erlaubt NICHTS — das wäre keine Liste, sondern ihre Abwesenheit', () => {
    expect(lookupKeyAllowedBy('irgendwas', ['*'])).toBe(false)
  })

  it('ein * mitten im Muster gilt nicht als Platzhalter', () => {
    expect(lookupKeyAllowedBy('event_ticket_sommerfest', ['event_*_sommerfest'])).toBe(false)
  })

  it('ohne Liste bleibt es bei der Grundregel', () => {
    // Die begründete Ausnahme: eine leere Liste zählt wie keine. Wer zumachen
    // will, trägt ein Muster ein — ein leeres Array ist zu leicht versehentlich.
    expect(rejectOneTimeLookupKey('beratungspaket', PLANS, undefined)).toBeNull()
    expect(rejectOneTimeLookupKey('beratungspaket', PLANS, [])).toBeNull()
  })
})
