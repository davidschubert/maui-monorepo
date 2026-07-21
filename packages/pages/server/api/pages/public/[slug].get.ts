import { Query } from 'node-appwrite'
import { PAGES_TABLE, type PageRow, type PublicPage } from '../../../../shared/types/page'

/**
 * Öffentlich: die VERÖFFENTLICHTE Seite für slug + locale (Fallback en).
 * Server-seitig über den Admin-Client gelesen + auf status='published'
 * gefiltert → Entwürfe werden nie ausgeliefert (Rows tragen keine Permissions).
 */
export default defineEventHandler(async (event): Promise<PublicPage> => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }
  const requested = String(getQuery(event).locale || 'en').slice(0, 8)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<PageRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: PAGES_TABLE,
    queries: [Query.equal('slug', slug), Query.equal('status', 'published'), Query.limit(20)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load page')
  })

  const row = res.rows.find(r => r.locale === requested)
    ?? res.rows.find(r => r.locale === 'en')
    ?? res.rows[0]
  if (!row) {
    throw createError({ status: 404, statusText: 'Page not found' })
  }
  return { slug: row.slug, locale: row.locale, title: row.title, body: row.body, updatedAt: row.$updatedAt }
})
