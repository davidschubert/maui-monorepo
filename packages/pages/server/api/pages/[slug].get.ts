import { Query } from 'node-appwrite'
import { PAGES_TABLE, type PageRow } from '../../../shared/types/page'

/** Admin: alle Sprachversionen einer Seite (inkl. body) zum Bearbeiten. */
export default defineEventHandler(async (event): Promise<{ rows: PageRow[] }> => {
  requirePermission(event, 'pages.manage')
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<PageRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: PAGES_TABLE,
    queries: scopeQuery(event, [Query.equal('slug', slug), Query.limit(20)]),
  }).catch((error) => {
    throw toH3Error(error, 'Could not load page')
  })
  return { rows: res.rows }
})
