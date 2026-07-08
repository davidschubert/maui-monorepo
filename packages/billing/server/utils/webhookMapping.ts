import type Stripe from 'stripe'
import type { BillingSubscriptionRow, MauiBillingPlan, SubscriptionStatus } from '../../shared/types/billing'
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
export function planIdForPrice(plans: readonly MauiBillingPlan[], lookupKey: string | null | undefined): string {
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
  plans: readonly MauiBillingPlan[],
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

/** B4-Stale-Guard: ältere (out-of-order/retryte) Events verwerfen */
export function isStale(existing: Pick<BillingSubscriptionRow, 'lastStripeEventAt'> | null, eventCreated: number): boolean {
  return !!existing && existing.lastStripeEventAt > eventCreated
}

/** Event-Allowlist (B4): alles andere → 200 + no-op */
export const WEBHOOK_ALLOWLIST = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])
