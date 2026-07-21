import { ID, Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import type Stripe from 'stripe'
import {
  BILLING_CUSTOMERS_TABLE,
  BILLING_SUBSCRIPTIONS_TABLE,
  type BillingCustomerRow,
  type BillingSubscriptionRow,
  type SubscriptionStatus,
} from '../../../shared/types/billing'
import { isNewPaymentFailure, isStale, subscriptionToPatch, subscriptionToVerifiedUpdate, toSubscriptionStatus, WEBHOOK_ALLOWLIST, type SubscriptionPatch } from '../../utils/webhookMapping'

/**
 * Stripe-Webhook (B1/B4): Signatur-Verifikation über den RAW-Body, Event-
 * Allowlist, idempotenter Upsert nach stripeSubscriptionId mit Stale-Guard.
 * Antworten: 400 bei ungültiger Signatur (generisch), 200 bei Erfolg/No-op,
 * 500 (generisch) bei Verarbeitungsfehlern → Stripe retryt (Handler sind
 * idempotent). NIEMALS Stripe-/Appwrite-Details im Response.
 */
export default defineEventHandler(async (event) => {
  await requireBillingEnabled(event)

  const secret = useRuntimeConfig(event).stripeWebhookSecret
  if (!secret) {
    console.error('[billing] NUXT_STRIPE_WEBHOOK_SECRET fehlt — Webhook kann Signaturen nicht prüfen.')
    throw createError({ status: 500, statusText: 'Payment provider not configured' })
  }

  const raw = await readRawBody(event)
  const signature = getHeader(event, 'stripe-signature')
  if (!raw || !signature) {
    throw createError({ status: 400, statusText: 'Invalid webhook' })
  }

  const stripe = useStripe(event)
  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(raw, signature, secret)
  }
  catch {
    throw createError({ status: 400, statusText: 'Invalid webhook' })
  }

  if (!WEBHOOK_ALLOWLIST.has(stripeEvent.type)) {
    return { received: true }
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object
        if (session.mode === 'payment') {
          // One-time-Checkout (z. B. Event-Tickets): App-registrierte
          // Fulfiller (idempotent) — billing kennt die Ziel-Layer nicht (A14)
          await runCheckoutFulfillments(event, session)
        }
        else if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const { applied } = await upsertSubscription(event, subscription, stripeEvent.created, session.client_reference_id ?? session.metadata?.userId ?? null)
          if (applied) await runSubscriptionFulfillments(event, subscriptionToVerifiedUpdate(subscription, stripeEvent.created))
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object
        const { applied } = await upsertSubscription(event, subscription, stripeEvent.created, subscription.metadata?.userId ?? null)
        if (applied) await runSubscriptionFulfillments(event, subscriptionToVerifiedUpdate(subscription, stripeEvent.created))
        break
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object
        const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent
        const legacySub = (invoice as unknown as { subscription?: string | { id: string } }).subscription
        const ref = parent?.subscription_details?.subscription ?? legacySub
        const subscriptionId = typeof ref === 'string' ? ref : ref?.id
        if (!subscriptionId) break
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const { applied, previousStatus } = await upsertSubscription(event, subscription, stripeEvent.created, subscription.metadata?.userId ?? null)
        if (applied) await runSubscriptionFulfillments(event, subscriptionToVerifiedUpdate(subscription, stripeEvent.created))

        // Notify NUR beim echten Übergang in einen Zahlungs-Problem-Status —
        // sonst spammt jeder Stripe-Retry/Doppel-Event denselben Hinweis.
        if (stripeEvent.type === 'invoice.payment_failed'
          && applied
          && isNewPaymentFailure(previousStatus, toSubscriptionStatus(subscription.status))) {
          // §6/§9: Zahlungsfehlschlag → In-App-notify (Core-Vertrag, best-effort).
          // Body-Sprache aus den Empfänger-Prefs (wie der Mail-Zweig, Fallback en) —
          // Bell-Bodies sind gespeicherter Roh-Text, daher hier lokalisiert erzeugen
          const row = await findSubscriptionRow(event, subscriptionId)
          if (row) {
            const { users } = createAdminClient(event)
            const prefs = await users.get({ userId: row.userId })
              .then(u => resolveEmailPrefs(u.prefs as Record<string, unknown>))
              .catch(() => null)
            await notify(event, {
              recipientId: row.userId,
              type: 'billing',
              title: row.planId,
              body: prefs?.emailLocale === 'de'
                ? 'Zahlung fehlgeschlagen — bitte Zahlungsmethode aktualisieren.'
                : 'Payment failed — please update your payment method.',
              link: '/account/billing',
            })
          }
        }
        break
      }
    }
  }
  catch (error) {
    console.error(`[billing] Webhook-Verarbeitung fehlgeschlagen (${stripeEvent.type}):`, error)
    throw createError({ status: 500, statusText: 'Webhook processing failed' })
  }

  return { received: true }
})

async function findSubscriptionRow(event: H3Event, stripeSubscriptionId: string): Promise<BillingSubscriptionRow | null> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<BillingSubscriptionRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: BILLING_SUBSCRIPTIONS_TABLE,
    queries: [Query.equal('stripeSubscriptionId', stripeSubscriptionId), Query.limit(1)],
  })
  return res.rows[0] ?? null
}

/** userId auflösen: metadata → billing_customers-Mapping (Fallback) */
async function resolveUserId(event: H3Event, stripeCustomerId: string, hint: string | null): Promise<string | null> {
  if (hint) return hint
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<BillingCustomerRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: BILLING_CUSTOMERS_TABLE,
    queries: [Query.equal('stripeCustomerId', stripeCustomerId), Query.limit(1)],
  })
  return res.rows[0]?.userId ?? null
}

/**
 * Idempotenter Upsert (B4): Unique uq_stripe_sub + Stale-Guard.
 * @returns applied = true, wenn ein nicht-staler Upsert angewandt wurde (Basis
 *   des Abo-Lifecycle-Vertrags); previousStatus = Status VOR diesem Event
 *   (null = Row existierte nicht) — trägt die Transition-Erkennung für die
 *   Zahlungsfehler-Benachrichtigung (verhindert Retry-Doppel-Notify).
 */
async function upsertSubscription(event: H3Event, subscription: Stripe.Subscription, eventCreated: number, userIdHint: string | null): Promise<{ applied: boolean, previousStatus: SubscriptionStatus | null }> {
  const billingConfig = await getBillingConfig(event)
  const patch: SubscriptionPatch = subscriptionToPatch(subscription, billingConfig.plans, eventCreated)
  // deleted-Events tragen den finalen Status im Objekt ('canceled')
  patch.status = toSubscriptionStatus(subscription.status)

  const existing = await findSubscriptionRow(event, subscription.id)
  const previousStatus = existing?.status ?? null
  if (isStale(existing, eventCreated)) return { applied: false, previousStatus }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  if (existing) {
    await admin.tablesDB.updateRow({
      databaseId,
      tableId: BILLING_SUBSCRIPTIONS_TABLE,
      rowId: existing.$id,
      data: { ...patch, userId: existing.userId },
    })
    return { applied: true, previousStatus }
  }

  const userId = await resolveUserId(event, patch.stripeCustomerId, userIdHint)
  if (!userId) {
    // Ohne Zuordnung keine Row — loggen, 200 lassen (Retry würde nichts ändern)
    console.error(`[billing] Webhook: kein userId-Mapping für Customer ${patch.stripeCustomerId} (Sub ${subscription.id})`)
    return { applied: false, previousStatus }
  }

  try {
    await admin.tablesDB.createRow({
      databaseId,
      tableId: BILLING_SUBSCRIPTIONS_TABLE,
      rowId: ID.unique(),
      data: { ...patch, userId },
      permissions: [Permission.read(Role.user(userId))],
    })
    return { applied: true, previousStatus }
  }
  catch (error) {
    // Unique-Race (Retry/Out-of-order-Create): Gewinner-Row aktualisieren
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
      const winner = await findSubscriptionRow(event, subscription.id)
      if (winner && !isStale(winner, eventCreated)) {
        await admin.tablesDB.updateRow({
          databaseId,
          tableId: BILLING_SUBSCRIPTIONS_TABLE,
          rowId: winner.$id,
          data: { ...patch, userId: winner.userId },
        })
        return { applied: true, previousStatus: winner.status }
      }
      return { applied: false, previousStatus: winner?.status ?? previousStatus }
    }
    throw error
  }
}
