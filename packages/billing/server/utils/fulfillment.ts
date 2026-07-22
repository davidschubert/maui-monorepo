import type { H3Event } from 'h3'
import type Stripe from 'stripe'
import type { SubscriptionStatus } from '../../shared/types/billing'

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
 * Abo-Lifecycle-Vertrag (M8): billing verifiziert Signatur + Idempotenz und
 * reicht dann ein bereits geprüftes Subscription-Update an App-registrierte
 * Handler weiter (z. B. Workspace-Billing des Studio) — nie rohes Stripe-JSON,
 * A14 wie beim Checkout-Vertrag. Läuft NUR für nicht-stale, tatsächlich
 * angewandte Upserts. Handler MÜSSEN idempotent sein (Webhook-Retry → 500
 * lässt Stripe wiederholen).
 */
export interface VerifiedSubscriptionUpdate {
  stripeSubscriptionId: string
  stripeCustomerId: string
  /** Stripe-Statusraum 1:1 (B3) — 'canceled' kommt erst zum echten Ende
   *  (cancel_at_period_end lässt den Status bis dahin auf 'active'). */
  status: SubscriptionStatus
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  /** subscription_data.metadata aus dem Checkout (z. B. workspaceId, plan). */
  metadata: Record<string, string>
  eventCreated: number
}

export type SubscriptionFulfillment = (event: H3Event, update: VerifiedSubscriptionUpdate) => Promise<void>

const subscriptionFulfillments: SubscriptionFulfillment[] = []

export function registerSubscriptionFulfillment(handler: SubscriptionFulfillment): void {
  subscriptionFulfillments.push(handler)
}

export async function runSubscriptionFulfillments(event: H3Event, update: VerifiedSubscriptionUpdate): Promise<void> {
  for (const handler of subscriptionFulfillments) {
    await handler(event, update)
  }
}

/** Kompakte Sicht auf EIN Stripe-Abo eines Customers (für Fulfillment-Checks). */
export interface CustomerSubscriptionSummary {
  id: string
  /** Stripe-Statusraum 1:1 (active/trialing/past_due/canceled/…). */
  status: string
  metadata: Record<string, string>
}

/**
 * Alle Abos eines Stripe-Customers, direkt von Stripe (#6b): Autorität für
 * Fulfillment-Entscheidungen wie „hat der Workspace noch ein anderes aktives
 * Abo?" — die lokale Abbild-Row kann durch out-of-order-Webhooks stale sein,
 * Stripe selbst nicht. Wirft bei API-Fehlern (Aufrufer entscheidet fail-closed).
 */
export async function listCustomerSubscriptionSummaries(event: H3Event, stripeCustomerId: string): Promise<CustomerSubscriptionSummary[]> {
  const stripe = useStripe(event)
  const { data } = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    limit: 100,
  }).catch(error => toStripeSafeError(error, 'subscriptions.list fehlgeschlagen'))
  return data.map(subscription => ({
    id: subscription.id,
    status: subscription.status,
    metadata: (subscription.metadata ?? {}) as Record<string, string>,
  }))
}

/**
 * Generische Abo-Checkout-Session für App-Kompositionen (M8 Workspace-
 * Billing): wie createPaymentCheckoutSession, aber mode 'subscription' und
 * metadata AUCH auf der Subscription (subscription_data) — nur so tragen
 * spätere customer.subscription.*-Events die Zuordnung (workspaceId).
 * BEWUSST ohne den 409-„bereits aktiv"-Check der App-Abo-Route: ein
 * Operator darf mehrere Workspace-Abos halten.
 */
export async function createSubscriptionCheckoutSession(event: H3Event, input: {
  lookupKey: string
  metadata: Record<string, string>
  successUrl: string
  cancelUrl: string
  /** Expliziter Stripe-Customer (#7a, z. B. der Workspace-Customer der App-
   *  Komposition). Ohne Angabe wie bisher: der Customer des eingeloggten
   *  Users (ensureCustomer). */
  stripeCustomerId?: string
}): Promise<string> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  await requireBillingEnabled(event)

  const customerId = input.stripeCustomerId ?? (await ensureCustomer(event, user)).stripeCustomerId
  const price = await resolvePriceByLookupKey(event, input.lookupKey)
  const stripe = useStripe(event)

  const metadata = { ...input.metadata, userId: user.$id }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: user.$id,
    metadata,
    subscription_data: { metadata },
    // §6: Stripe Tax + Pflicht-Rechnungsadresse (wie alle Checkouts)
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  }).catch(error => toStripeSafeError(error, 'checkout.sessions.create (workspace subscription) fehlgeschlagen'))

  if (!session.url) {
    throw createError({ status: 502, statusText: 'Payment provider unavailable' })
  }
  return session.url
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
