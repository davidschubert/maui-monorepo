import { describe, expect, it } from 'vitest'
import { checkoutOutcome, mayFulfillCheckout, WEBHOOK_ALLOWLIST } from '../server/utils/webhookMapping'
import { lookupKeyAllowedBy, matchesLookupKeyPattern, planLookupKeys, rejectOneTimeLookupKey, rejectSubscriptionLookupKey } from '../shared/lookupKeys'
import { resolveBillingReturnOrigin } from '../shared/returnOrigin'
import type { PukalaniBillingPlan } from '../shared/types/billing'

const PLANS: PukalaniBillingPlan[] = [
  { id: 'free', labelKey: 'billing.plans.free', products: [], lookupKeys: null },
  { id: 'pro', labelKey: 'billing.plans.pro', products: ['paidCourses'], lookupKeys: { monthly: 'maui_pro_monthly', yearly: 'maui_pro_yearly' } },
]

/**
 * „WARE OHNE GELD" (Audit-Befund 1, 2026-08-02). Der Kern in einem Satz:
 * `checkout.session.completed` heißt nicht „bezahlt". Diese Suite nagelt alle
 * vier Wege einer Checkout-Session fest.
 */
describe('mayFulfillCheckout', () => {
  it('erfüllt bei paid', () => {
    expect(mayFulfillCheckout('paid')).toBe(true)
  })

  it('erfüllt bei no_payment_required (0-€-Session, 100-%-Gutschein)', () => {
    expect(mayFulfillCheckout('no_payment_required')).toBe(true)
  })

  it('erfüllt NICHT bei unpaid — das ist der SEPA-/Rechnungs-Fall', () => {
    expect(mayFulfillCheckout('unpaid')).toBe(false)
  })

  it('erfüllt NICHT ohne Status (fehlendes Feld → fail-closed)', () => {
    expect(mayFulfillCheckout(undefined)).toBe(false)
    expect(mayFulfillCheckout(null)).toBe(false)
    expect(mayFulfillCheckout('')).toBe(false)
  })
})

describe('checkoutOutcome — die vier Fälle', () => {
  it('completed + paid → erfüllen', () => {
    expect(checkoutOutcome('checkout.session.completed', 'paid')).toBe('fulfill')
  })

  it('completed + unpaid → NICHT erfüllen, auf die Zahlung warten', () => {
    expect(checkoutOutcome('checkout.session.completed', 'unpaid')).toBe('await_payment')
  })

  it('async_payment_succeeded + paid → erfüllen (der Nachzügler holt es nach)', () => {
    expect(checkoutOutcome('checkout.session.async_payment_succeeded', 'paid')).toBe('fulfill')
  })

  it('async_payment_succeeded ohne paid → trotzdem nicht erfüllen', () => {
    expect(checkoutOutcome('checkout.session.async_payment_succeeded', 'unpaid')).toBe('await_payment')
  })

  it('async_payment_failed → geplatzt, nie erfüllen', () => {
    expect(checkoutOutcome('checkout.session.async_payment_failed', 'unpaid')).toBe('payment_failed')
  })

  it('expired → verfallen, nie erfüllen', () => {
    expect(checkoutOutcome('checkout.session.expired', 'unpaid')).toBe('expired')
  })

  it('unbekannter Event-Typ erfüllt NIE (fail-closed)', () => {
    expect(checkoutOutcome('checkout.session.something_new', 'paid')).toBe('await_payment')
  })
})

describe('WEBHOOK_ALLOWLIST', () => {
  it('hört auf alle drei Nachzügler-Events — sonst endet eine verzögerte Zahlung im Nichts', () => {
    expect(WEBHOOK_ALLOWLIST.has('checkout.session.async_payment_succeeded')).toBe(true)
    expect(WEBHOOK_ALLOWLIST.has('checkout.session.async_payment_failed')).toBe(true)
    expect(WEBHOOK_ALLOWLIST.has('checkout.session.expired')).toBe(true)
  })

  it('bleibt sonst eng (kein Sammelbecken)', () => {
    expect(WEBHOOK_ALLOWLIST.has('payment_intent.succeeded')).toBe(false)
    expect(WEBHOOK_ALLOWLIST.has('charge.refunded')).toBe(false)
  })
})

/** Preis-Allowlist (Audit-Befund 2). */
describe('planLookupKeys', () => {
  it('sammelt beide Intervalle jedes zahlenden Plans', () => {
    expect(planLookupKeys(PLANS)).toEqual(['maui_pro_monthly', 'maui_pro_yearly'])
  })

  it('überspringt Pläne ohne Stripe-Objekt (free)', () => {
    expect(planLookupKeys([PLANS[0]!])).toEqual([])
  })
})

describe('matchesLookupKeyPattern', () => {
  it('vergleicht ohne * exakt', () => {
    expect(matchesLookupKeyPattern('event_ticket_42', 'event_ticket_42')).toBe(true)
    expect(matchesLookupKeyPattern('event_ticket_43', 'event_ticket_42')).toBe(false)
  })

  it('erlaubt EIN * am Ende als Präfix', () => {
    expect(matchesLookupKeyPattern('event_ticket_42', 'event_ticket_*')).toBe(true)
    expect(matchesLookupKeyPattern('maui_pro_monthly', 'event_ticket_*')).toBe(false)
  })

  it('lehnt das nackte * ab — eine Allowlist, die alles erlaubt, ist keine', () => {
    expect(matchesLookupKeyPattern('irgendwas', '*')).toBe(false)
  })

  it('ist gegen leere Eingaben dicht', () => {
    expect(matchesLookupKeyPattern('', 'event_ticket_*')).toBe(false)
    expect(matchesLookupKeyPattern('event_ticket_42', '')).toBe(false)
  })
})

describe('rejectSubscriptionLookupKey — harte Allowlist', () => {
  it('lässt einen deklarierten Plan-Key durch', () => {
    expect(rejectSubscriptionLookupKey('maui_pro_yearly', PLANS)).toBeNull()
  })

  it('lehnt einen fremden Key ab — genau der Fall „Body-Feld durchgereicht"', () => {
    expect(rejectSubscriptionLookupKey('irgendein_fremder_price', PLANS)).toBe('unknown_plan')
  })

  it('lehnt ab, wenn gar kein Plan Stripe-Keys trägt', () => {
    expect(rejectSubscriptionLookupKey('maui_pro_yearly', [PLANS[0]!])).toBe('unknown_plan')
  })
})

describe('rejectOneTimeLookupKey', () => {
  it('lehnt Plan-Keys im Einmal-Checkout ab (ein Abo ist keine Einmalzahlung)', () => {
    expect(rejectOneTimeLookupKey('maui_pro_monthly', PLANS, undefined)).toBe('plan_key_in_one_time_checkout')
  })

  it('lässt einen Event-Ticket-Key ohne konfigurierte Liste durch (bewusst offen)', () => {
    expect(rejectOneTimeLookupKey('event_ticket_42', PLANS, undefined)).toBeNull()
    expect(rejectOneTimeLookupKey('event_ticket_42', PLANS, [])).toBeNull()
  })

  it('verengt auf die Liste, sobald eine gesetzt ist', () => {
    expect(rejectOneTimeLookupKey('event_ticket_42', PLANS, ['event_ticket_*'])).toBeNull()
    expect(rejectOneTimeLookupKey('fremder_price', PLANS, ['event_ticket_*'])).toBe('not_purchasable')
  })

  it('Plan-Key bleibt verboten, auch wenn die Liste ihn nennen würde', () => {
    expect(rejectOneTimeLookupKey('maui_pro_monthly', PLANS, ['maui_*'])).toBe('plan_key_in_one_time_checkout')
  })
})

describe('lookupKeyAllowedBy', () => {
  it('reicht ein Treffer aus der Liste', () => {
    expect(lookupKeyAllowedBy('b', ['a', 'b'])).toBe(true)
    expect(lookupKeyAllowedBy('c', ['a', 'b'])).toBe(false)
    expect(lookupKeyAllowedBy('c', [])).toBe(false)
  })
})

/** Rücksprung-Ziel (Audit-Befund 7). */
describe('resolveBillingReturnOrigin', () => {
  it('nimmt die konfigurierte Basis-URL und ignoriert den Request-Host', () => {
    expect(resolveBillingReturnOrigin('https://boese.example', 'https://comments.pukalani.app'))
      .toBe('https://comments.pukalani.app')
  })

  it('wirft Pfad/Query der Basis-URL weg — nur der Origin zählt', () => {
    expect(resolveBillingReturnOrigin('https://boese.example', 'https://comments.pukalani.app/de/pricing?x=1'))
      .toBe('https://comments.pukalani.app')
  })

  it('fällt ohne Konfiguration auf den Request-Origin zurück (lokale Entwicklung)', () => {
    expect(resolveBillingReturnOrigin('http://localhost:3001', '')).toBe('http://localhost:3001')
    expect(resolveBillingReturnOrigin('http://localhost:3001', undefined)).toBe('http://localhost:3001')
  })

  it('ignoriert eine unbrauchbare Basis-URL statt daran zu scheitern', () => {
    expect(resolveBillingReturnOrigin('http://localhost:3001', 'nicht-mal-eine-url')).toBe('http://localhost:3001')
    expect(resolveBillingReturnOrigin('http://localhost:3001', 'javascript:alert(1)')).toBe('http://localhost:3001')
  })

  it('liefert einen leeren Origin, wenn beides fehlt — nie einen geratenen Host', () => {
    expect(resolveBillingReturnOrigin('', '')).toBe('')
  })
})
