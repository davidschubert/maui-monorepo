import { Query } from 'node-appwrite'
import { TENANT_PLANS_TABLE, parseTenantPlanLimits, type TenantPlanRow } from '../../../../shared/types/tenantRecord'

/** Betreiber: editierbarer Quota-Katalog (tenant_plans, studio-014) auflisten. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<TenantPlanRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANT_PLANS_TABLE,
    queries: [Query.orderAsc('key'), Query.limit(25)],
  }).catch((error) => { throw toH3Error(error, 'Could not list tenant plans') })
  return { plans: rows.map(row => ({ key: row.key, limits: parseTenantPlanLimits(row.limits) })) }
})
