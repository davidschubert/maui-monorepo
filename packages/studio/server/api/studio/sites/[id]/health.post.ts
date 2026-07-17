import { SITES_TABLE, type SiteRow } from '../../../../../shared/types/site'
import { checkSiteHealth } from '../../../../utils/siteHealth'

/**
 * Manueller Health-Check einer registrierten Site (sites.manage) — nutzt
 * dieselbe Logik wie der Intervall-Sweep (siteHealth.ts): Appwrite-Endpoint
 * + App-URL proben, Feature-Snapshot der Site mitnehmen, persistieren.
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

  const site = await admin.tablesDB.getRow<SiteRow>({ databaseId, tableId: SITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Site not found') })

  const result = await checkSiteHealth(admin, databaseId, site)
    .catch((error) => { throw toH3Error(error, 'Could not persist health status') })

  return result
})
