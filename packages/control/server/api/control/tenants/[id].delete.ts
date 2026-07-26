import { TENANTS_TABLE } from '../../../../shared/types/tenantRecord'

/** Betreiber: Tenant-Row löschen (Host offline; Kundendaten im Pool bleiben —
 *  deren Lebenszyklus gehört zum künftigen Offboarding, nicht hierher). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing tenant id' })
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Could not delete tenant') })
  return { ok: true }
})
