import { ID } from 'node-appwrite'
import { tenantCreateSchema } from '../../../../schemas/tenant'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'

/**
 * Betreiber: neuen Tenant anlegen — DER Onboarding-Kern („neue Pool-Site" =
 * diese eine Row; die Platform-App löst den Host beim nächsten Request auf,
 * Resolver-Cache max. 30 s). UX 2026-07-23: der Betreiber liefert NAME + Host
 * (aus dem Namen vorgeschlagen); projectId ist im Pool-Modus der konfigurierte
 * Default (maui.studio.defaultPoolProject), nur Silo MUSS eins nennen.
 * pool ohne tenantId → frische Id (t-…); doppelter Host → 409 via uq_host.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const body = await readValidatedBody(event, tenantCreateSchema.parse)

  const appConfig = useAppConfig() as { maui?: { studio?: { defaultPoolProject?: string } } }
  const projectId = body.projectId ?? (body.mode === 'pool' ? appConfig.maui?.studio?.defaultPoolProject : undefined)
  if (!projectId) {
    throw createError({ status: 400, statusText: 'Silo tenants need an explicit project id' })
  }
  const tenantId = body.mode === 'pool' ? (body.tenantId ?? `t-${ID.unique()}`) : ''

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.createRow<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TENANTS_TABLE,
    rowId: ID.unique(),
    data: { name: body.name, host: body.host, mode: body.mode, projectId, tenantId, status: 'active', wave: body.wave ?? 'stable' },
  }).catch((error) => { throw toH3Error(error, 'Could not create tenant') })

  return { id: row.$id, name: row.name, host: row.host, mode: row.mode, projectId: row.projectId, tenantId: row.tenantId, status: row.status, wave: row.wave }
})
