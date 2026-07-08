import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { BILLING_CUSTOMERS_TABLE, BILLING_SUBSCRIPTIONS_TABLE, type BillingCustomerRow, type BillingSubscriptionRow } from '../../shared/types/billing'

/**
 * GDPR-Contributor des billing-Layers: die lokalen Rows sind nur eine
 * Projektion — Export liefert sie vollständig, Löschung entfernt sie hart
 * und löscht den Stripe-Customer best-effort mit (Stripe behält steuerlich
 * Pflichtiges selbst; das ist deren Compliance-Bereich).
 */
export async function billingExportUserData(event: H3Event, userId: string) {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const customers = await listAllRows<BillingCustomerRow>(tablesDB, databaseId, BILLING_CUSTOMERS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as BillingCustomerRow[])
  const subscriptions = await listAllRows<BillingSubscriptionRow>(tablesDB, databaseId, BILLING_SUBSCRIPTIONS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as BillingSubscriptionRow[])

  return {
    customer: customers.map(c => ({ stripeCustomerId: c.stripeCustomerId, email: c.email, createdAt: c.$createdAt })),
    subscriptions: subscriptions.map(s => ({
      planId: s.planId, status: s.status, currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd, createdAt: s.$createdAt,
    })),
  }
}

export async function billingDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0

  const subscriptions = await listAllRows<BillingSubscriptionRow>(tablesDB, databaseId, BILLING_SUBSCRIPTIONS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as BillingSubscriptionRow[])
  for (const row of subscriptions) {
    await tablesDB.deleteRow({ databaseId, tableId: BILLING_SUBSCRIPTIONS_TABLE, rowId: row.$id })
    deleted++
  }

  const customers = await listAllRows<BillingCustomerRow>(tablesDB, databaseId, BILLING_CUSTOMERS_TABLE, [Query.equal('userId', userId)])
    .catch(() => [] as BillingCustomerRow[])
  for (const row of customers) {
    await tablesDB.deleteRow({ databaseId, tableId: BILLING_CUSTOMERS_TABLE, rowId: row.$id })
    deleted++
    // Stripe-Customer best-effort löschen (kündigt aktive Abos mit) —
    // scheitert er, bleibt Stripe die Wahrheit, unsere Pflicht ist erfüllt
    try {
      const stripe = useStripe(event)
      await stripe.customers.del(row.stripeCustomerId)
    }
    catch {
      // Key fehlt/Netz — dokumentierter Rest im Stripe-Dashboard
    }
  }

  return { deleted, anonymized: 0 }
}
