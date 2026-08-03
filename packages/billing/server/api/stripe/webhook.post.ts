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
import { checkoutOutcome, isNewPaymentFailure, isStale, subscriptionToPatch, subscriptionToVerifiedUpdate, toSubscriptionStatus, WEBHOOK_ALLOWLIST, type CheckoutOutcome, type SubscriptionPatch } from '../../utils/webhookMapping'

/**
 * Stripe-Webhook (B1/B4): Signatur-Verifikation über den RAW-Body, Event-
 * Allowlist, idempotenter Upsert nach stripeSubscriptionId mit Stale-Guard.
 * Antworten: 400 bei ungültiger Signatur (generisch), 200 bei Erfolg/No-op,
 * 500 (generisch) bei Verarbeitungsfehlern → Stripe retryt (Handler sind
 * idempotent). NIEMALS Stripe-/Appwrite-Details im Response.
 */
export default defineEventHandler(async (event) => {
  await requireBillingEnabled(event)

  // Ohne Signatur-Secret kann diese Installation keinen Webhook ANNEHMEN —
  // also hostet sie auch keinen. 404, dieselbe Antwort wie das Gate zwei
  // Zeilen darüber und wie die Datentür.
  //
  // Vorher stand hier 500. Das war falsch klassifiziert: 5xx heißt „der Server
  // ist kaputt" und landet als Vorfall in der Fehler-Ablage — an einer
  // öffentlichen URL, die jeder Fremde unsigniert anstoßen kann. Eine bewusst
  // nicht eingerichtete Route ist aber kein Ausfall, sondern eine Abwesenheit.
  // Live erwischt am 2026-07-30: `comments` antwortete 500, `control` 400.
  const secret = useRuntimeConfig(event).stripeWebhookSecret
  if (!secret) {
    warnMisconfiguredOnce('webhookSecret', '[billing] NUXT_STRIPE_WEBHOOK_SECRET fehlt — Webhook nimmt nichts an (404). Nur relevant, wenn diese Installation Stripe-Events empfangen SOLL.')
    throw createError({ status: 404, statusText: 'Not found' })
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
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        const session = stripeEvent.data.object
        if (session.mode === 'payment') {
          // One-time-Checkout (z. B. Event-Tickets): App-registrierte
          // Fulfiller (idempotent) — billing kennt die Ziel-Layer nicht (A14).
          //
          // ABER ERST GEGEN GELD (Audit 2026-08-02): `completed` allein heißt
          // nur „durch den Checkout", nicht „bezahlt" — bei SEPA/Rechnung kommt
          // die Belastung Tage später. Der Status entscheidet, nicht der
          // Event-Name; die vier Fälle stecken in `checkoutOutcome`.
          const outcome = checkoutOutcome(stripeEvent.type, session.payment_status)
          if (outcome === 'fulfill') {
            await runCheckoutFulfillments(event, session)
          }
          else {
            logCheckoutWithoutFulfillment(outcome, stripeEvent.type, session)
          }
        }
        else if (session.mode === 'subscription' && session.subscription) {
          // Abos hängen NICHT am payment_status der Session, sondern am STATUS
          // des Abos (eine unbezahlte Erstbelastung lässt es 'incomplete' —
          // und das steht nicht in ENTITLED_STATUSES). Der Upsert ist deshalb
          // auf jedem dieser vier Events richtig und idempotent; die
          // Nachzügler-Events halten den Spiegel aktuell.
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
            /**
             * WENN DER EMPFÄNGER HIER NICHT EXISTIERT, ERREICHT IHN NICHTS —
             * und das darf nicht still passieren (gemessen 2026-08-03).
             *
             * Bei einem COMMUNITY-Abo (A6) stammt `row.userId` aus dem
             * POOL-Projekt: der Kunde klickt auf seinem Community-Host, das JWT
             * wird gegen `onboardingRuntimeProject` geprüft, und diese Id reist
             * als `metadata.userId` durch Stripe bis hierher. Der Webhook läuft
             * aber auf `control` — dort gibt es diese Id nicht (nachgemessen:
             * 404 user_not_found). Folge: die Glocken-Zeile bekommt
             * `read(user:<pool-id>)` und ist im control-Projekt für niemanden
             * lesbar, UND `maybeSendInstantEmail` scheitert an derselben
             * Nachschlage — es kommt also über KEINEN Kanal etwas an, während
             * der M13-Sweep nach 14 Tagen die Community auf nur-lesend setzt.
             *
             * Die saubere Lösung ist eine Entscheidung (wo gehört die
             * Zahlungswarnung eines Community-Owners hin — Kontobereich oder
             * Community-Glocke?) und steht als offener Punkt. Bis dahin ist der
             * Ausfall wenigstens LAUT: ein stiller Fehlschlag im Geldpfad ist
             * genau die Sorte, die man erst bemerkt, wenn ein Kunde kündigt.
             */
            const recipient = await users.get({ userId: row.userId }).catch(() => null)
            if (!recipient) {
              logEvent('error', 'billing.notify_recipient_missing', {
                subscriptionId,
                recipientId: row.userId,
                reason: 'Empfänger existiert im Projekt dieses Webhooks nicht — Zahlungswarnung erreicht niemanden (Community-Abo? siehe Kopf).',
              })
            }
            const prefs = recipient ? resolveEmailPrefs(recipient.prefs as Record<string, unknown>) : null
            await notify(event, {
              recipientId: row.userId,
              type: 'billing',
              title: row.planId,
              body: prefs?.emailLocale === 'de'
                ? 'Zahlung fehlgeschlagen — bitte Zahlungsmethode aktualisieren.'
                : 'Payment failed — please update your payment method.',
              link: '/account/billing',
              // MANDANTENLOS (C15, Davids Entscheidung 3): das ist eine Sache
              // des VERTRAGS, nicht einer Community. Ein Community-Stempel
              // (den der Webhook ohnehin nicht hat — er kommt von Stripe, ohne
              // Mandanten-Host) würde die Zahlungswarnung in die Glocke von
              // Mitgliedern legen, die sie nichts angeht. Sie gehört in den
              // Kundenbereich, und der Link zeigt bereits dorthin.
              scope: 'account',
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

/**
 * Eine Checkout-Session, die NICHT erfüllt wurde — sichtbar machen.
 *
 * WARUM ÜBERHAUPT EINE ZEILE: der stille Zustand ist hier der Schaden. Ohne
 * sie sähe ein Betreiber eine abgeschlossene Session im Stripe-Dashboard und
 * kein Ticket in seiner App — ohne jede Spur, warum. `logEvent` schreibt
 * strukturiert (Sentry-Andockpunkt), die Session-Id ist der Schlüssel zum
 * Nachschlagen bei Stripe.
 *
 * WAS DIE FÄLLE BEDEUTEN:
 *  - `await_payment`  = normal bei SEPA/Rechnung. Der Nachzügler
 *    (`async_payment_succeeded`) erfüllt später — `warn`, kein Vorfall.
 *  - `payment_failed` = das Geld kommt NIE. `error`, weil hier jemand
 *    hinsehen muss: hat eine ÄLTERE Installation (vor diesem Fix) oder ein
 *    Fulfiller außer der Reihe die Ware schon ausgegeben, ist sie jetzt
 *    zurückzunehmen. Diese Route kann das nicht wissen und tut deshalb
 *    NICHTS still — sie sagt es.
 *  - `expired`        = der Kunde ist nie fertig geworden. Erwartbar, `warn`.
 *
 * KEIN throw: nichts davon ist ein transienter Fehler, ein Stripe-Retry würde
 * exakt dasselbe Ergebnis liefern (Webhook-Regel: werfen nur, wenn ein
 * Wiederholen helfen KANN).
 */
function logCheckoutWithoutFulfillment(
  outcome: Exclude<CheckoutOutcome, 'fulfill'>,
  eventType: string,
  session: Stripe.Checkout.Session,
): void {
  const detail = {
    outcome,
    eventType,
    sessionId: session.id,
    paymentStatus: session.payment_status,
    // Nur die Zuordnung, kein Kunden-Detail — der Rest steht bei Stripe.
    metadata: session.metadata ?? {},
  }
  logEvent(outcome === 'payment_failed' ? 'error' : 'warn', 'billing.checkout_not_fulfilled', detail)
}

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
