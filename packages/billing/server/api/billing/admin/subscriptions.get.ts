import { Query } from 'node-appwrite'
import { BILLING_SUBSCRIPTIONS_TABLE, type BillingAdminSubscriptionRow, type BillingSubscriptionRow } from '../../../../shared/types/billing'

const PAGE_SIZE = 50

/**
 * Admin-Übersicht (billing.manage, §6: read-only + Stripe-Deep-Link in der
 * UI — Aktionen passieren im Stripe-Dashboard, weniger sicherheitskritische
 * Fläche).
 */
export default defineEventHandler(async (event): Promise<{ total: number, rows: BillingAdminSubscriptionRow[] }> => {
  requirePermission(event, 'billing.manage')
  await requireBillingEnabled(event)

  const query = getQuery(event)
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const dir = query.dir === 'asc' ? 'asc' : 'desc'
  // Nachschlagen statt Volltext: gesucht wird hier nach EINEM Konto, und die
  // beiden Wege dorthin sind indiziert (idx_user, idx_customer). Eine
  // Volltextsuche über Plan-Namen gäbe es nur mit einem weiteren Index und
  // beantwortet keine Frage, die ein Betreiber wirklich stellt.
  const lookup = String(query.lookup ?? '').trim()
  const lookupQueries = lookup
    ? [lookup.startsWith('cus_')
        ? Query.equal('stripeCustomerId', lookup)
        : Query.equal('userId', lookup)]
    : []

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const res = await admin.tablesDB.listRows<BillingSubscriptionRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: BILLING_SUBSCRIPTIONS_TABLE,
    queries: [
      ...lookupQueries,
      dir === 'asc' ? Query.orderAsc('$updatedAt') : Query.orderDesc('$updatedAt'),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load subscriptions')
  })

  // Namen in EINEM gebündelten users.list (Muster resolveAvatars) statt einem
  // Abruf je Zeile — eine Seite hat bis zu 50 Abos. Fail-soft: ohne
  // users-Scope bleibt die Karte leer und die UI zeigt weiter die Id.
  const names = new Map<string, { name: string, email: string }>()
  const ids = [...new Set(res.rows.map(row => row.userId).filter(Boolean))]
  if (ids.length > 0) {
    try {
      const list = await admin.users.list({ queries: [Query.equal('$id', ids), Query.limit(ids.length)] })
      for (const user of list.users) names.set(user.$id, { name: user.name, email: user.email })
    }
    catch {
      // bewusst still — die Übersicht funktioniert auch ohne Namen
    }
  }

  const rows: BillingAdminSubscriptionRow[] = res.rows.map(row => ({
    ...row,
    userName: names.get(row.userId)?.name ?? '',
    userEmail: names.get(row.userId)?.email ?? '',
  }))

  return { total: res.total, rows }
})
