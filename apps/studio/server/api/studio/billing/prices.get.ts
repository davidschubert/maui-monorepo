import type Stripe from 'stripe'
import type { StudioPlanCatalog } from '../../../../../../packages/studio/shared/types/workspace'

/**
 * Betreiber: aktuelle Stripe-Preise des Workspace-Plan-Katalogs (per
 * lookup_key, Test- wie Live-Mode). APP-Route (A14: komponiert den
 * studio-Plan-Katalog mit der billing-Stripe-Utility — die Layer kennen
 * sich nicht). Read-only; die Änderung läuft über prices.post.ts.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  await requireBillingEnabled(event)

  const appConfig = useAppConfig() as { maui?: { studio?: { plans?: StudioPlanCatalog } } }
  const plans = appConfig.maui?.studio?.plans ?? {}
  const lookupKeys: { plan: string, interval: 'monthly' | 'yearly', lookupKey: string }[] = []
  for (const [plan, def] of Object.entries(plans)) {
    if (def?.lookupKey) lookupKeys.push({ plan, interval: 'monthly', lookupKey: def.lookupKey })
    if (def?.lookupKeyYearly) lookupKeys.push({ plan, interval: 'yearly', lookupKey: def.lookupKeyYearly })
  }
  if (lookupKeys.length === 0) return { prices: [], livemode: false }

  const stripe = useStripe(event)
  const found = await stripe.prices.list({
    lookup_keys: lookupKeys.map(entry => entry.lookupKey),
    expand: ['data.product'],
    limit: 100,
  }).catch((error: unknown) => toStripeSafeError(error, 'prices.list failed'))

  const byLookup = new Map(found.data.map(price => [price.lookup_key, price]))
  return {
    livemode: found.data[0]?.livemode ?? false,
    prices: lookupKeys.map(({ plan, interval, lookupKey }) => {
      const price = byLookup.get(lookupKey)
      const product = price?.product as Stripe.Product | undefined
      return {
        plan,
        interval,
        lookupKey,
        // fehlender Preis = lookup_key in Stripe (noch) nicht angelegt
        // (ensure-prices.mjs) — UI zeigt das als „nicht angelegt"
        amount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        productName: typeof product === 'object' ? product?.name ?? null : null,
      }
    }),
  }
})
