import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { BILLING_SUBSCRIPTIONS_TABLE, ENTITLED_STATUSES, type BillingSubscriptionRow } from '../../shared/types/billing'

/**
 * Entitlement-Fundament (B6): EINE indizierte Query nach userId, pro Request
 * memoized am event.context. „Aktiv" = status ∈ ENTITLED_STATUSES (§6:
 * past_due behält Zugriff — Stripe-Dunning arbeitet).
 */
export async function getActiveSubscription(event: H3Event): Promise<BillingSubscriptionRow | null> {
  const user = event.context.user
  if (!user) return null

  const ctx = event.context as { _billingSubscription?: BillingSubscriptionRow | null }
  if (ctx._billingSubscription !== undefined) return ctx._billingSubscription

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<BillingSubscriptionRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: BILLING_SUBSCRIPTIONS_TABLE,
    queries: [Query.equal('userId', user.$id), Query.orderDesc('$updatedAt'), Query.limit(5)],
  }).catch(() => ({ rows: [] as BillingSubscriptionRow[] }))

  const active = res.rows.find(row => (ENTITLED_STATUSES as readonly string[]).includes(row.status)) ?? null
  ctx._billingSubscription = active
  return active
}

/** Features des aktiven Plans (aus maui.billing.plans aufgelöst) */
export async function getEntitledFeatures(event: H3Event): Promise<string[]> {
  const subscription = await getActiveSubscription(event)
  if (!subscription) return []
  const config = await getBillingConfig(event)
  return config.plans.find(plan => plan.id === subscription.planId)?.features ?? []
}

/** Gate für zahlungspflichtige Features — 401 ohne Session, 402 ohne Plan-Feature */
export async function requireEntitlement(event: H3Event, feature: string): Promise<void> {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const features = await getEntitledFeatures(event)
  if (!features.includes(feature)) {
    throw createError({ status: 402, statusText: 'Upgrade required' })
  }
}
