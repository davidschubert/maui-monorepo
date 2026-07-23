import { EMBED_SITES_TABLE } from '../../../../shared/types/embedSite'
import { invalidateEmbedSitesCache } from '../../../utils/embedSites'

/** Betreiber: Einbetter-Site löschen (E3) — fliegt sofort aus der CSP. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing site id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EMBED_SITES_TABLE,
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Could not delete embed site') })

  invalidateEmbedSitesCache()
  return { ok: true }
})
