import { Query } from 'node-appwrite'
import { BILLING_SUBSCRIPTIONS_TABLE, type BillingSubscriptionRow } from '../../../../shared/types/billing'

const PAGE_SIZE = 50

/**
 * Admin-Übersicht (billing.manage, §6: read-only + Stripe-Deep-Link in der
 * UI — Aktionen passieren im Stripe-Dashboard, weniger sicherheitskritische
 * Fläche).
 */
export default defineEventHandler(async (event): Promise<{ total: number, rows: BillingSubscriptionRow[] }> => {
  requirePermission(event, 'billing.manage')
  await requireBillingEnabled(event)

  const page = Math.max(1, Number(getQuery(event).page ?? 1) || 1)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const res = await admin.tablesDB.listRows<BillingSubscriptionRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: BILLING_SUBSCRIPTIONS_TABLE,
    queries: [
      Query.orderDesc('$updatedAt'),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load subscriptions')
  })

  return { total: res.total, rows: res.rows }
})
