import type { BillingSubscriptionResponse } from '../../../shared/types/billing'

/**
 * Eigenes Abo (SSR-Hydration von useBilling): Subscription-Row + aufgelöster
 * Plan + Produkt-Liste. Gäste bekommen den Free-Zustand (kein 401 — die
 * Pricing-Seite ist öffentlich).
 */
export default defineEventHandler(async (event): Promise<BillingSubscriptionResponse> => {
  await requireBillingEnabled(event)

  const subscription = await getActiveSubscription(event)
  const products = await getEntitledProducts(event)

  return {
    subscription,
    planId: subscription?.planId ?? null,
    products,
    entitled: subscription !== null,
  }
})
