import { tenantStatusSchema } from '../../../../schemas/tenant'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'

/** Betreiber: Tenant an/aus (disabled → Resolver liefert null → Host 404;
 *  greift durch den Resolver-Cache spätestens nach 30 s) und/oder
 *  Update-Welle wechseln (H3-4.2). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing tenant id' })
  const body = await readValidatedBody(event, tenantStatusSchema.parse)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    rowId: id,
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.wave !== undefined ? { wave: body.wave } : {}),
    },
  }).catch((error) => { throw toH3Error(error, 'Could not update tenant') })
  return { id: row.$id, status: row.status, wave: row.wave }
})
