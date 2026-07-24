import { z } from 'zod'
import type { StudioPlanCatalog } from '../../../../../../packages/studio/shared/types/workspace'
import { pickLookupKey } from '../../../../../../packages/studio/shared/workspaceBilling'

const schema = z.object({
  plan: z.string().regex(/^[a-z][a-z0-9-]*$/),
  interval: z.enum(['monthly', 'yearly']),
  /** Neuer Betrag in CENT (1900 = 19,00 €). Bewusste Grenzen gegen Tippfehler. */
  amount: z.number().int().min(100).max(10_000_000),
}).strict()

/**
 * Betreiber: Preis eines Workspace-Plans ändern. Stripe-Preise sind
 * UNVERÄNDERLICH — „ändern" heißt: neuen Price am selben Product anlegen,
 * den lookup_key mit `transfer_lookup_key` übertragen und den alten Price
 * archivieren. Neue Checkouts bekommen sofort den neuen Preis (Checkout löst
 * per lookup_key auf); BESTANDS-Abos behalten ihren alten Preis
 * (Grandfathering) — bewusst, Preiserhöhungen für Bestandskunden wären ein
 * eigener, kommunikationspflichtiger Schritt.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  await requireBillingEnabled(event)

  const body = await readValidatedBody(event, schema.parse)

  const appConfig = useAppConfig() as { maui?: { studio?: { plans?: StudioPlanCatalog } } }
  const plan = (appConfig.maui?.studio?.plans ?? {})[body.plan]
  if (!plan) throw createError({ status: 400, statusText: 'Unknown plan' })
  const lookupKey = pickLookupKey(plan, body.interval)
  if (!lookupKey) throw createError({ status: 400, statusText: 'Plan has no price (free)' })

  const stripe = useStripe(event)
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], expand: ['data.product'], limit: 1 })
    .catch((error: unknown) => toStripeSafeError(error, 'prices.list failed'))
  const oldPrice = existing.data[0]
  if (!oldPrice) {
    // Ohne Alt-Preis fehlt das Product — erst ensure-prices.mjs laufen lassen
    throw createError({ status: 409, statusText: 'Price not provisioned yet (run ensure-prices)' })
  }
  if (oldPrice.unit_amount === body.amount) {
    return { unchanged: true, amount: body.amount, currency: oldPrice.currency }
  }

  const productId = typeof oldPrice.product === 'string' ? oldPrice.product : oldPrice.product.id
  const created = await stripe.prices.create({
    product: productId,
    currency: oldPrice.currency,
    unit_amount: body.amount,
    recurring: { interval: body.interval === 'yearly' ? 'year' : 'month' },
    lookup_key: lookupKey,
    // überträgt den lookup_key vom alten auf den neuen Price (atomar bei Stripe)
    transfer_lookup_key: true,
  }).catch((error: unknown) => toStripeSafeError(error, 'prices.create failed'))

  // Ist der alte Price der default_price des Products, verweigert Stripe das
  // Archivieren — Default erst auf den neuen Price umstellen.
  const product = typeof oldPrice.product === 'object' && !('deleted' in oldPrice.product) ? oldPrice.product : null
  if (product?.default_price === oldPrice.id || (typeof product?.default_price === 'object' && product.default_price?.id === oldPrice.id)) {
    await stripe.products.update(productId, { default_price: created.id })
      .catch((error: unknown) => toStripeSafeError(error, 'products.update (default_price) failed'))
  }

  // Alten Preis archivieren — Bestands-Abos laufen darauf weiter (Grandfathering),
  // aber neue Checkouts können ihn nicht mehr treffen.
  await stripe.prices.update(oldPrice.id, { active: false })
    .catch((error: unknown) => toStripeSafeError(error, 'prices.update (archive) failed'))

  return {
    unchanged: false,
    amount: created.unit_amount,
    currency: created.currency,
    priceId: created.id,
    archivedPriceId: oldPrice.id,
  }
})
