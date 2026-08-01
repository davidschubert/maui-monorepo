import { ID, Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { BILLING_CUSTOMERS_TABLE, type BillingCustomerRow } from '../../shared/types/billing'

/**
 * userId ↔ stripeCustomerId (B11): lazy beim ersten Checkout. Unique-Index
 * uq_user ist der Race-Schutz — verliert unser Create, lesen wir die
 * Gewinner-Row nach und löschen den doppelt erzeugten Stripe-Customer.
 */
export async function ensureCustomer(event: H3Event, user: Models.User<Models.Preferences>): Promise<BillingCustomerRow> {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const existing = await admin.tablesDB.listRows<BillingCustomerRow>({
    databaseId,
    tableId: BILLING_CUSTOMERS_TABLE,
    queries: [Query.equal('userId', user.$id), Query.limit(1)],
  })
  if (existing.rows[0]) return existing.rows[0]

  const stripe = useStripe(event)
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: user.name || undefined,
    metadata: { userId: user.$id },
  }).catch(error => toStripeSafeError(error, 'customers.create fehlgeschlagen'))

  try {
    return await admin.tablesDB.createRow<BillingCustomerRow>({
      databaseId,
      tableId: BILLING_CUSTOMERS_TABLE,
      rowId: ID.unique(),
      data: { userId: user.$id, stripeCustomerId: customer.id, email: user.email ?? '' },
      permissions: [Permission.read(Role.user(user.$id))],
    })
  }
  catch (error) {
    // Unique-Race: der Gewinner steht — dessen Row nutzen, unseren
    // Doppel-Customer bei Stripe wieder aufräumen (best-effort)
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
      await stripe.customers.del(customer.id).catch(() => {})
      const winner = await admin.tablesDB.listRows<BillingCustomerRow>({
        databaseId,
        tableId: BILLING_CUSTOMERS_TABLE,
        queries: [Query.equal('userId', user.$id), Query.limit(1)],
      })
      if (winner.rows[0]) return winner.rows[0]
    }
    throw toH3Error(error, 'Could not prepare checkout')
  }
}
