import { ID } from 'node-appwrite'
import { tenantCreateSchema } from '../../../../schemas/tenant'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'

/**
 * Betreiber: neuen Tenant anlegen — DER Onboarding-Kern („neue Pool-Site" =
 * diese eine Row; die Platform-App löst den Host beim nächsten Request auf,
 * Resolver-Cache max. 30 s). pool ohne tenantId → frische Id (t-…);
 * doppelter Host → 409 über den Unique-Index uq_host.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const body = await readValidatedBody(event, tenantCreateSchema.parse)

  const tenantId = body.mode === 'pool' ? (body.tenantId ?? `t-${ID.unique()}`) : ''
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.createRow<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    rowId: ID.unique(),
    data: { host: body.host, mode: body.mode, projectId: body.projectId, tenantId, status: 'active' },
  }).catch((error) => { throw toH3Error(error, 'Could not create tenant') })

  return { id: row.$id, host: row.host, mode: row.mode, projectId: row.projectId, tenantId: row.tenantId, status: row.status }
})
