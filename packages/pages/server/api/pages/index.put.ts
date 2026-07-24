import { ID, Query } from 'node-appwrite'
import { pageUpsertSchema } from '../../../schemas/page'
import { PAGES_TABLE, type PageRow } from '../../../shared/types/page'

/** Admin: eine Seiten-Sprachversion anlegen/aktualisieren (upsert nach slug+locale). */
export default defineEventHandler(async (event): Promise<PageRow> => {
  requirePermission(event, 'pages.manage')
  const body = await readValidatedBody(event, pageUpsertSchema.parse)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // H3-Pool: im Pool stempelt scopeRow die tenantId (Naht 3) — der Upsert-
  // Lookup MUSS ebenso gescopet sein, sonst trifft slug+locale die Seite
  // eines fremden Tenants (geteilter slug-Namensraum: jeder hat 'home').
  const data = scopeRow(event, {
    slug: body.slug,
    locale: body.locale,
    title: body.title,
    body: body.body,
    status: body.status,
    sortOrder: body.sortOrder ?? 0,
  })

  const existing = await admin.tablesDB.listRows<PageRow>({
    databaseId,
    tableId: PAGES_TABLE,
    queries: scopeQuery(event, [Query.equal('slug', body.slug), Query.equal('locale', body.locale), Query.limit(1)]),
  }).catch((error) => {
    throw toH3Error(error, 'Could not save page')
  })

  if (existing.rows[0]) {
    return await admin.tablesDB.updateRow<PageRow>({
      databaseId, tableId: PAGES_TABLE, rowId: existing.rows[0].$id, data,
    }).catch((error) => {
      throw toH3Error(error, 'Could not save page')
    })
  }
  return await admin.tablesDB.createRow<PageRow>({
    databaseId, tableId: PAGES_TABLE, rowId: ID.unique(), data,
  }).catch((error) => {
    throw toH3Error(error, 'Could not save page')
  })
})
