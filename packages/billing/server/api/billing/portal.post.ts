import { Query } from 'node-appwrite'
import { BILLING_CUSTOMERS_TABLE, type BillingCustomerRow } from '../../../shared/types/billing'

/**
 * Customer Portal (Ablauf 4.3): einzige Mutations-UI nach dem Kauf
 * (Plan wechseln, Zahlungsmethode, Kündigung, Rechnungen).
 */
export default defineEventHandler(async (event) => {
  await requireBillingEnabled(event)

  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
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
    return_url: `${origin}${localePrefix}/account/billing`,
  }).catch(error => toStripeSafeError(error, 'billingPortal.sessions.create fehlgeschlagen'))

  return { url: session.url }
})
