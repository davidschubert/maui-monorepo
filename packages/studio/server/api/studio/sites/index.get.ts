import { Query } from 'node-appwrite'
import { SITES_TABLE, type SiteRow } from '../../../../shared/types/site'

/** Sites-Register (sites.manage) — Statusübersicht des Control Plane. */
export default defineEventHandler(async (event): Promise<{ sites: SiteRow[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<SiteRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: SITES_TABLE,
    queries: [Query.orderAsc('slug'), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Sites register missing — run migrations') })

  return { sites: res.rows }
})
