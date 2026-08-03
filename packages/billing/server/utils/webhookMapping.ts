import type Stripe from 'stripe'
import type { BillingSubscriptionRow, PukalaniBillingPlan, SubscriptionStatus } from '../../shared/types/billing'
import { SUBSCRIPTION_STATUSES } from '../../shared/types/billing'

/**
 * PURE Webhook-Mapping-Funktionen (B16): Stripe-Payload → Row-Patch, ohne
 * Appwrite/Stripe-Clients — vollständig unit-testbar. Die Route wendet die
 * Patches idempotent an (Upsert nach stripeSubscriptionId + Stale-Guard).
 */

export interface SubscriptionPatch {
  stripeSubscriptionId: string
  stripeCustomerId: string
  status: SubscriptionStatus
  planId: string
  priceId: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd: string | null
  lastStripeEventAt: number
}

/** Stripe-Status defensiv in unseren Statusraum heben (unbekannt → 'unpaid') */
export function toSubscriptionStatus(value: string): SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value)
    ? value as SubscriptionStatus
    : 'unpaid'
}

/** Price-Id → interner Plan (lookup_key-Vergleich über beide Intervalle) */
export function planIdForPrice(plans: readonly PukalaniBillingPlan[], lookupKey: string | null | undefined): string {
  if (!lookupKey) return 'unknown'
  const plan = plans.find(p => p.lookupKeys && (p.lookupKeys.monthly === lookupKey || p.lookupKeys.yearly === lookupKey))
  return plan?.id ?? 'unknown'
}

/**
 * Subscription-Objekt → Row-Patch. `eventCreated` (Unix-Sekunden) füttert den
 * B4-Stale-Guard. current_period_end liegt seit Stripe-API 2025 auf dem
 * Subscription-ITEM (Basil-Breaking-Change), Fallback aufs Legacy-Feld.
 */
export function subscriptionToPatch(
  subscription: Stripe.Subscription,
  plans: readonly PukalaniBillingPlan[],
  eventCreated: number,
): SubscriptionPatch {
  const item = subscription.items.data[0]
  const legacyPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
  const periodEnd = item?.current_period_end ?? legacyPeriodEnd ?? 0

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    status: toSubscriptionStatus(subscription.status),
    planId: planIdForPrice(plans, item?.price.lookup_key),
    priceId: item?.price.id ?? '',
    currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    lastStripeEventAt: eventCreated,
  }
}

/**
 * Subscription-Objekt → verifiziertes Update für den Abo-Lifecycle-Vertrag
 * (M8, registerSubscriptionFulfillment). Pure — nutzt dieselbe Periodenende-
 * Logik wie subscriptionToPatch (Basil-Breaking-Change, Item-Fallback).
 */
export function subscriptionToVerifiedUpdate(
  subscription: Stripe.Subscription,
  eventCreated: number,
): {
    stripeSubscriptionId: string
    stripeCustomerId: string
    status: SubscriptionStatus
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
    metadata: Record<string, string>
    eventCreated: number
  } {
  const item = subscription.items.data[0]
  const legacyPeriodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end
  const periodEnd = item?.current_period_end ?? legacyPeriodEnd ?? 0

  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    status: toSubscriptionStatus(subscription.status),
    currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    metadata: (subscription.metadata ?? {}) as Record<string, string>,
    eventCreated,
  }
}

/** B4-Stale-Guard: ältere (out-of-order/retryte) Events verwerfen */
export function isStale(existing: Pick<BillingSubscriptionRow, 'lastStripeEventAt'> | null, eventCreated: number): boolean {
  return !!existing && existing.lastStripeEventAt > eventCreated
}

/** Zahlungs-Problem-Status (Dunning): Zugriff bleibt, aber der User muss handeln */
export const FAILED_PAYMENT_STATUSES: readonly SubscriptionStatus[] = ['past_due', 'unpaid']

/**
 * Soll bei invoice.payment_failed eine (In-App-)Benachrichtigung raus?
 * NUR beim ÜBERGANG in einen Zahlungs-Problem-Status — nicht, wenn das Abo
 * schon in Dunning war. Sonst spammt jeder Stripe-Retry/jede Doppelzustellung
 * desselben Events den User (der Stale-Guard nutzt `>`, ein Retry mit gleichem
 * Timestamp gilt als „angewandt"). Pure → unit-testbar.
 */
export function isNewPaymentFailure(previousStatus: SubscriptionStatus | null, newStatus: SubscriptionStatus): boolean {
  const failed = (s: SubscriptionStatus | null) => s !== null && FAILED_PAYMENT_STATUSES.includes(s)
  return failed(newStatus) && !failed(previousStatus)
}

/**
 * WESSEN GLOCKE BEKOMMT DIE ZAHLUNGSWARNUNG? (Davids Entscheidung 2026-08-03)
 *
 * 'account' — der Zahlende ist ein KONTO dieses Projekts (Silo, Einzel-Abo).
 *   Der Webhook meldet selbst: `users.get` findet den Empfänger, die
 *   Glocken-Zeile ist lesbar, die Mail geht raus. Unverändert seit §6/§9.
 *
 * 'community' — der Zahlende ist eine COMMUNITY (A6). Der Webhook meldet NICHT:
 *   er läuft auf `control`, der Owner ist ein Nutzer des RUNTIME-Projekts, und
 *   dorthin hat das Control Plane keinen Schlüssel. Gemeldet wird im Pool
 *   (packages/onboarding/server/utils/pastDueNotice.ts) — in die
 *   COMMUNITY-Glocke, wo der Owner ohnehin eingeloggt ist.
 *
 * Der Unterschied hängt an EINEM Merkmal: `subscription_data.metadata.communityId`
 * setzt ausschließlich der Community-Checkout des Control Plane
 * (apps/control/server/utils/communityCheckout.ts). Ein Silo-Abo trägt es nie —
 * dieser Zweig kann dort also gar nicht greifen. PURE, damit genau das prüfbar
 * ist, ohne einen Stripe-Webhook nachzustellen.
 */
export type PaymentFailureAudience = 'account' | 'community'

export function paymentFailureAudience(metadata: Record<string, string> | null | undefined): PaymentFailureAudience {
  return metadata?.communityId ? 'community' : 'account'
}

/**
 * WANN IST DIE WARE BEZAHLT? (Audit-Befund 2026-08-02, „Ware ohne Geld")
 *
 * `checkout.session.completed` heißt NICHT „bezahlt", sondern nur „der Kunde
 * ist durch den Checkout durch". Bei einer VERZÖGERTEN Zahlungsart
 * (SEPA-Lastschrift, Rechnung, Sofort/Bancontact-Nachläufer) feuert das Event
 * mit `payment_status: 'unpaid'` — die Belastung passiert erst Tage später und
 * kann scheitern. Welche Methoden Stripe anbietet, entscheidet das DASHBOARD
 * (keine unserer Checkout-Erzeugungen setzt `payment_method_types`), es genügt
 * also EIN Klick dort, damit dieser Fall real wird. Deshalb hängt die
 * Erfüllung am Zahlungs-Status, nicht am Event-Namen.
 *
 * `no_payment_required` gehört dazu: das setzt Stripe bei Sessions über 0 €
 * (100-%-Gutschein, Freikarte). Da IST nichts zu belasten — die Ware ist fällig.
 */
export const FULFILLABLE_PAYMENT_STATUSES: readonly string[] = ['paid', 'no_payment_required']

export function mayFulfillCheckout(paymentStatus: string | null | undefined): boolean {
  return !!paymentStatus && FULFILLABLE_PAYMENT_STATUSES.includes(paymentStatus)
}

/**
 * Was mit einer Checkout-Session zu geschehen hat. PURE → alle vier Fälle
 * unit-getestet, die Route macht nur noch Nebenwirkungen.
 *
 * - `fulfill`       → erfüllen (Geld ist da oder war nie fällig)
 * - `await_payment` → NICHTS erfüllen, protokollieren (Zahlung läuft noch)
 * - `payment_failed`→ NICHTS erfüllen, LAUT protokollieren (Zahlung geplatzt)
 * - `expired`       → NICHTS erfüllen, protokollieren (Session verfallen)
 *
 * Unbekannte Event-Typen fallen auf `await_payment` — fail-closed: lieber
 * nichts ausliefern als etwas verschenken.
 */
export type CheckoutOutcome = 'fulfill' | 'await_payment' | 'payment_failed' | 'expired'

export function checkoutOutcome(eventType: string, paymentStatus: string | null | undefined): CheckoutOutcome {
  switch (eventType) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return mayFulfillCheckout(paymentStatus) ? 'fulfill' : 'await_payment'
    case 'checkout.session.async_payment_failed':
      return 'payment_failed'
    case 'checkout.session.expired':
      return 'expired'
    default:
      return 'await_payment'
  }
}

/**
 * Event-Allowlist (B4): alles andere → 200 + no-op.
 *
 * Die drei `async_payment_*`/`expired`-Einträge kamen am 2026-08-02 dazu. Ohne
 * sie endete eine verzögerte Zahlung im Nichts: `completed` erfüllte sofort
 * (siehe `mayFulfillCheckout`), und ob das Geld später ankam oder platzte,
 * erfuhr diese Installation NIE — es gab schlicht keinen Empfänger für die
 * Nachricht.
 */
export const WEBHOOK_ALLOWLIST = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])
