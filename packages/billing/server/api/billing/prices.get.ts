import type { BillingInterval, BillingPricesResponse } from '../../../shared/types/billing'
import { BILLING_INTERVALS } from '../../../shared/types/billing'

/**
 * Öffentliche Preisliste für die Pricing-Seite: löst die lookup_keys aller
 * Pläne über den Price-Cache (TTL 5 min) auf und gibt NUR Betrag + Währung
 * zurück (keine Stripe-Ids). Ist Stripe (noch) nicht konfiguriert oder nicht
 * erreichbar, antwortet die Route mit prices: null — die Seite rendert dann
 * ohne Beträge statt mit 5xx (Pricing ist öffentlich und muss immer stehen).
 */
export default defineEventHandler(async (event): Promise<BillingPricesResponse> => {
  const config = await requireBillingEnabled(event)

  try {
    const prices: NonNullable<BillingPricesResponse['prices']> = {}
    for (const plan of config.plans) {
      if (!plan.lookupKeys) continue
      const entry: Partial<Record<BillingInterval, { amount: number, currency: string }>> = {}
      for (const interval of BILLING_INTERVALS) {
        const price = await resolvePriceByLookupKey(event, plan.lookupKeys[interval])
        if (typeof price.unit_amount === 'number') {
          entry[interval] = { amount: price.unit_amount, currency: price.currency }
        }
      }
      prices[plan.id] = entry
    }
    return { prices }
  }
  catch (error) {
    // resolvePriceByLookupKey loggt bereits; hier bewusst degradieren
    console.error('[billing] Preisliste nicht verfügbar — Pricing rendert ohne Beträge.', error)
    return { prices: null }
  }
})
