import { createCheckoutSchema } from '../../../schemas/billing'

/**
 * Abo-Checkout (Ablauf 4.1): planId+interval → Stripe-hosted Checkout-URL.
 * Gates: 404 (Gate aus), 401 (Gast), 400 (unbekannter Plan, B5-Tampering),
 * 409 (bereits aktives Abo → Portal nutzen). §6: Stripe Tax an (B2C),
 * Pflicht-Rechnungsadresse, kein Trial.
 */
export default defineEventHandler(async (event) => {
  const billingConfig = await requireBillingEnabled(event)

  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const paidPlanIds = billingConfig.plans.filter(plan => plan.lookupKeys).map(plan => plan.id)
  const body = await readValidatedBody(event, createCheckoutSchema(paidPlanIds).parse)

  const active = await getActiveSubscription(event)
  if (active) {
    throw createError({ status: 409, statusText: 'Subscription already active — use the portal' })
  }

  const plan = billingConfig.plans.find(p => p.id === body.planId)!
  const lookupKey = body.interval === 'yearly' ? plan.lookupKeys!.yearly : plan.lookupKeys!.monthly

  const customer = await ensureCustomer(event, user)
  const price = await resolvePriceByLookupKey(event, lookupKey)
  const stripe = useStripe(event)

  // Redirect-Ziele aus dem Request-Origin — localePath-Logik: der aktuelle
  // Locale-Prefix kommt vom Client mit (referer-frei, explizit)
  const origin = getRequestURL(event).origin
  const localePrefix = typeof getQuery(event).locale === 'string' && getQuery(event).locale === 'de' ? '/de' : ''

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.stripeCustomerId,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.$id,
    metadata: { userId: user.$id, planId: plan.id },
    subscription_data: { metadata: { userId: user.$id, planId: plan.id } },
    // §6: Stripe Tax (B2C) + Pflicht-Rechnungsadresse; Stripe-Invoicing genügt
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: `${origin}${localePrefix}/account/billing?checkout=success`,
    cancel_url: `${origin}${localePrefix}/pricing`,
  }).catch(error => toStripeSafeError(error, 'checkout.sessions.create (subscription) fehlgeschlagen'))

  if (!session.url) {
    throw createError({ status: 502, statusText: 'Payment provider unavailable' })
  }
  return { url: session.url }
})
