import { z } from 'zod'
import { BILLING_INTERVALS } from '../shared/types/billing'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/**
 * Checkout-Body: planId wird zur LAUFZEIT gegen die konfigurierten Pläne
 * validiert (B5 — Preis-Tampering ausgeschlossen: der Client nennt nie einen
 * Price, nur den internen Plan-Key).
 */
export function createCheckoutSchema(planIds: readonly string[], t: TranslateFn = identity) {
  return z.object({
    planId: z.string().refine(id => planIds.includes(id), t('billing.validation.planUnknown')),
    interval: z.enum(BILLING_INTERVALS).default('monthly'),
  })
}
