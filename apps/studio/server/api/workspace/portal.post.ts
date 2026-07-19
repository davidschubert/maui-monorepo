import { Query } from 'node-appwrite'
import { BILLING_CUSTOMERS_TABLE, type BillingCustomerRow } from '../../../../../packages/billing/shared/types/billing'

/**
 * Stripe-Kundenportal für Workspace-Owner (M9-T3) — APP-Route (A14).
 * Kündigung/Zahlungsmethode/Rechnungen laufen über das seit M8 konfigurierte
 * Portal; Voraussetzung: mindestens eine Membership (sonst 403) und ein
 * Billing-Customer (entsteht mit dem ersten Checkout, sonst 404).
 * Rückkehr in den Kundenbereich.
 */
export default defineEventHandler(async (event) => {
  await requireBillingEnabled(event)
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const memberships = await listOwnMemberships(event)
  if (memberships.length === 0) {
    throw createError({ status: 403, statusText: 'Not a workspace member' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const customer = await admin.tablesDB.listRows<BillingCustomerRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: BILLING_CUSTOMERS_TABLE,
    queries: [Query.equal('userId', user.$id), Query.limit(1)],
  })
  if (!customer.rows[0]) {
    throw createError({ status: 404, statusText: 'No billing account yet' })
  }

  const origin = getRequestURL(event).origin
  const localePrefix = typeof getQuery(event).locale === 'string' && getQuery(event).locale === 'de' ? '/de' : ''
  const stripe = useStripe(event)
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.rows[0].stripeCustomerId,
    return_url: `${origin}${localePrefix}/workspace`,
  }).catch(error => toStripeSafeError(error, 'billingPortal.sessions.create (workspace) fehlgeschlagen'))

  return { url: session.url }
})
