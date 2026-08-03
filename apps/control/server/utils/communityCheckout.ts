import type { H3Event } from 'h3'
import type { TenantRow } from '../../../../packages/control/shared/types/tenantRecord'
import { COMMUNITIES_TABLE } from '../../../../packages/control/shared/types/tenantRecord'
import { pickLookupKey } from '../../../../packages/control/shared/communityBilling'
import type { ControlPlanCatalog, PlanBillingInterval } from '../../../../packages/control/shared/types/planCatalog'
import { CHECKOUT_PAYMENT_METHOD_TYPES } from '../../../../packages/billing/shared/paymentMethods'

/**
 * A6 Schritt 3 — APP-Komposition (A14): der
 * Community-Checkout verbindet das control-Datenmodell (tenants) mit der
 * billing-Stripe-Utility. Läuft als SERVICE-Route ohne Browser-Session —
 * deshalb NICHT createSubscriptionCheckoutSession (die verlangt
 * event.context.user), sondern direkte Session-Anlage mit denselben Feldern
 * (automatic_tax, Pflicht-Rechnungsadresse, metadata auch auf der
 * Subscription — nur so trägt der Webhook die communityId).
 *
 * Der CUSTOMER gehört der COMMUNITY (#7a-Lektion: nie am persönlichen
 * User-Customer aufhängen — sonst zieht ein Besitzerwechsel den falschen
 * Vertrag mit). Success/Cancel-URLs baut der SERVER aus tenants.host —
 * nie aus dem Body (kein offener Redirect).
 */

const LIVE_BILLING_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid'])

export function communityHasLiveSubscription(tenant: Pick<TenantRow, 'stripeSubscriptionId' | 'billingStatus'>): boolean {
  return !!tenant.stripeSubscriptionId && LIVE_BILLING_STATUSES.has(tenant.billingStatus ?? '')
}

export function communityPlans(): ControlPlanCatalog {
  const appConfig = useAppConfig() as { pukalani?: { control?: { plans?: ControlPlanCatalog } } }
  return appConfig.pukalani?.control?.plans ?? {}
}

/** Stripe-Customer der Community — wiederverwenden oder anlegen und SOFORT
 *  auf der tenants-Row verankern (Webhook-Events ordnen sich über die
 *  Metadata zu, aber das Portal braucht den Customer VOR dem ersten Event). */
export async function ensureCommunityCustomer(event: H3Event, tenant: TenantRow, ownerEmail: string): Promise<string> {
  if (tenant.stripeCustomerId) return tenant.stripeCustomerId

  const stripe = useStripe(event)
  const customer = await stripe.customers.create({
    email: ownerEmail,
    name: tenant.name || tenant.host,
    metadata: { communityId: tenant.$id },
  }).catch(error => toStripeSafeError(error, 'customers.create (community) fehlgeschlagen'))

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  await admin.tablesDB.updateRow<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: tenant.$id,
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

export async function createCommunityCheckoutUrl(event: H3Event, input: {
  tenant: TenantRow
  ownerEmail: string
  ownerUserId: string
  plan: string
  interval: PlanBillingInterval
}): Promise<string> {
  const plans = communityPlans()
  const plan = plans[input.plan]
  const lookupKey = plan ? pickLookupKey(plan, input.interval) : null
  if (!lookupKey) {
    throw createError({ status: 400, statusText: 'Plan has no checkout' })
  }

  const customerId = await ensureCommunityCustomer(event, input.tenant, input.ownerEmail)
  const price = await resolvePriceByLookupKey(event, lookupKey)
  const stripe = useStripe(event)

  const base = `https://${input.tenant.host}/dashboard/settings/subscription`
  const metadata = { communityId: input.tenant.$id, plan: input.plan, userId: input.ownerUserId }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: input.ownerUserId,
    metadata,
    subscription_data: { metadata },
    // F20: nur Karte — keine verzögert abrechnenden Methoden.
    // Begründung in shared/paymentMethods.ts.
    payment_method_types: [...CHECKOUT_PAYMENT_METHOD_TYPES],
    // §6: Stripe Tax + Pflicht-Rechnungsadresse (wie alle Checkouts)
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: `${base}?checkout=success`,
    cancel_url: `${base}?checkout=canceled`,
  }).catch(error => toStripeSafeError(error, 'checkout.sessions.create (community subscription) fehlgeschlagen'))

  if (!session.url) {
    throw createError({ status: 502, statusText: 'Payment provider unavailable' })
  }
  return session.url
}

export async function createCommunityPortalUrl(event: H3Event, tenant: TenantRow): Promise<string> {
  if (!tenant.stripeCustomerId) {
    throw createError({ status: 409, statusText: 'No billing account yet' })
  }
  const stripe = useStripe(event)
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `https://${tenant.host}/dashboard/settings/subscription`,
  }).catch(error => toStripeSafeError(error, 'billingPortal.sessions.create (community) fehlgeschlagen'))
  return session.url
}
