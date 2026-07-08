import type { H3Event } from 'h3'
import type Stripe from 'stripe'

/**
 * Erfüllungs-Vertrag für One-time-Checkouts (mode 'payment', §5b):
 * billing kennt KEINE anderen Feature-Layer (A14) — die APP registriert
 * hier, was nach checkout.session.completed passieren soll (z. B.
 * grantEventTicket aus dem events-Layer). Best-effort im Webhook:
 * ein werfender Fulfiller lässt den Webhook 500en → Stripe retryt
 * (die Fulfiller MÜSSEN deshalb idempotent sein).
 */
export type CheckoutFulfillment = (event: H3Event, session: Stripe.Checkout.Session) => Promise<void>

const fulfillments: CheckoutFulfillment[] = []

export function registerCheckoutFulfillment(handler: CheckoutFulfillment): void {
  fulfillments.push(handler)
}

export async function runCheckoutFulfillments(event: H3Event, session: Stripe.Checkout.Session): Promise<void> {
  for (const handler of fulfillments) {
    await handler(event, session)
  }
}

/**
 * Generische One-time-Checkout-Session (mode 'payment') für App-Kompositionen
 * — z. B. Event-Tickets: die APP-Route validiert das Zielobjekt (events-Layer)
 * und ruft dann diese Billing-Utility (kein Cross-Layer-Import nötig).
 */
export async function createPaymentCheckoutSession(event: H3Event, input: {
  lookupKey: string
  metadata: Record<string, string>
  successUrl: string
  cancelUrl: string
}): Promise<string> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  await requireBillingEnabled(event)

  const customer = await ensureCustomer(event, user)
  const price = await resolvePriceByLookupKey(event, input.lookupKey)
  const stripe = useStripe(event)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customer.stripeCustomerId,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.$id,
    metadata: { ...input.metadata, userId: user.$id },
    // §6: Stripe Tax an (B2C) + Pflicht-Rechnungsadresse
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  }).catch(error => toStripeSafeError(error, 'checkout.sessions.create (payment) fehlgeschlagen'))

  if (!session.url) {
    throw createError({ status: 502, statusText: 'Payment provider unavailable' })
  }
  return session.url
}
