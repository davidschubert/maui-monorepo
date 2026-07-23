import { Query } from 'node-appwrite'
import { EMBED_SITES_TABLE, type EmbedSiteRow } from '../../../../shared/types/embedSite'

/** Betreiber: Einbetter-Registry auflisten (E3). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows, total } = await admin.tablesDB.listRows<EmbedSiteRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EMBED_SITES_TABLE,
    queries: [Query.orderAsc('host'), Query.limit(200)],
  }).catch((error) => { throw toH3Error(error, 'Could not list embed sites') })
  return { total, sites: rows.map(row => ({
    id: row.$id, host: row.host, label: row.label ?? '', targetTypes: row.targetTypes ?? [], active: row.active !== false,
  })) }
})
