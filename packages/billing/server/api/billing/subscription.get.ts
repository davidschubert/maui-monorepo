import type { BillingSubscriptionResponse } from '../../../shared/types/billing'

/**
 * Eigenes Abo (SSR-Hydration von useBilling): Subscription-Row + aufgelöster
 * Plan + Feature-Liste. Gäste bekommen den Free-Zustand (kein 401 — die
 * Pricing-Seite ist öffentlich).
 */
export default defineEventHandler(async (event): Promise<BillingSubscriptionResponse> => {
  await requireBillingEnabled(event)

  const subscription = await getActiveSubscription(event)
  const features = await getEntitledFeatures(event)

  return {
    subscription,
    planId: subscription?.planId ?? null,
    features,
    entitled: subscription !== null,
  }
})
