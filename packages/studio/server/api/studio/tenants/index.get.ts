import { Query } from 'node-appwrite'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'

/** Betreiber: Tenants (Host→Mandant-Register) auflisten. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows, total } = await admin.tablesDB.listRows<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    queries: [Query.orderAsc('host'), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not list tenants') })
  if (total > rows.length) {
    console.warn(`[studio] tenants-Liste gekappt: ${rows.length}/${total} — Pagination nachrüsten`)
  }
  return { total, tenants: rows.map(row => ({
    id: row.$id, name: row.name, host: row.host, mode: row.mode, projectId: row.projectId, tenantId: row.tenantId, status: row.status,
  })) }
})
