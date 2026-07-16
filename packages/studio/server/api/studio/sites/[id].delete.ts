import { SITES_TABLE, type SiteRow } from '../../../../shared/types/site'

/**
 * Site aus dem Register entfernen (sites.manage) — entfernt NUR den
 * Register-Eintrag, niemals das Appwrite-Projekt oder dessen Daten
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

  return { ok: true, slug: row.slug }
})
