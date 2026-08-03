import { createCheckoutSchema } from '../../../schemas/billing'
import { CHECKOUT_PAYMENT_METHOD_TYPES } from '../../../shared/paymentMethods'

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
  const price = await resolvePlanPrice(event, lookupKey)
  const stripe = useStripe(event)

  // Redirect-Ziele: NICHT aus dem Host-Header, sondern aus der konfigurierten
  // Basis-URL der App (Audit 2026-08-02 — auf einer Wildcard-Site lenkte ein
  // gefälschter Host den Rücksprung auf einen fremden Host; Begründung in
  // shared/returnOrigin.ts). Nur der Locale-Prefix kommt weiter vom Client
  // (referer-frei, explizit) — er ist ein Pfad, kein Ziel-Host.
  const origin = billingReturnOrigin(event)
  const localePrefix = typeof getQuery(event).locale === 'string' && getQuery(event).locale === 'de' ? '/de' : ''

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customer.stripeCustomerId,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.$id,
    metadata: { userId: user.$id, planId: plan.id },
    subscription_data: { metadata: { userId: user.$id, planId: plan.id } },
    // F20: nur Karte — keine verzögert abrechnenden Methoden.
    // Begründung in shared/paymentMethods.ts.
    payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
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
