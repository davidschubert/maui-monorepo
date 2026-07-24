import { Query } from 'node-appwrite'
import { PAGES_TABLE, type PageRow } from '../../../shared/types/page'

/** Admin: eine Seite (alle Sprachversionen) löschen. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'pages.manage')
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const res = await admin.tablesDB.listRows<PageRow>({
    databaseId,
    tableId: PAGES_TABLE,
    queries: scopeQuery(event, [Query.equal('slug', slug), Query.limit(50)]),
  }).catch((error) => {
    throw toH3Error(error, 'Could not delete page')
  })

  await Promise.all(res.rows.map(row =>
    admin.tablesDB.deleteRow({ databaseId, tableId: PAGES_TABLE, rowId: row.$id }),
  )).catch((error) => {
    throw toH3Error(error, 'Could not delete page')
  })

  return { deleted: res.rows.length }
})
