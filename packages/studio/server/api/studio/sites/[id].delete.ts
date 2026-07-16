import { Query } from 'node-appwrite'
import { SITES_TABLE, type SiteRow } from '../../../../shared/types/site'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../../../shared/types/entitlement'

/**
 * Site aus dem Register entfernen (sites.manage) — entfernt NUR den
 * Register-Eintrag samt seiner Entitlement-Rows (Register-seitige Daten im
 * Studio-Projekt), niemals das Appwrite-Projekt der Site oder dessen Daten
 * (Lösch-Lifecycle mit Export/Fristen ist L2, kommt mit dem Provisioner).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing site id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const row = await admin.tablesDB.getRow<SiteRow>({ databaseId, tableId: SITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Site not found') })

  await admin.tablesDB.deleteRow({ databaseId, tableId: SITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Could not deregister site') })

  const { rows: entitlements } = await admin.tablesDB.listRows<EntitlementRow>({
    databaseId, tableId: ENTITLEMENTS_TABLE,
    queries: [Query.equal('siteProjectId', row.projectId), Query.limit(100)],
  }).catch(() => ({ rows: [] as EntitlementRow[] }))
  await Promise.all(entitlements.map(entitlement =>
    admin.tablesDB.deleteRow({ databaseId, tableId: ENTITLEMENTS_TABLE, rowId: entitlement.$id }).catch(() => {}),
  ))

  return { ok: true, slug: row.slug }
})
