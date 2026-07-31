import { Query } from 'node-appwrite'
import { PAGES_TABLE, type PageRow, type PublicPage } from '../../../../shared/types/page'

/**
 * Öffentlich: die VERÖFFENTLICHTE Seite für slug + locale (Fallback en).
 * Server-seitig über den Admin-Client gelesen + auf status='published'
 * gefiltert → Entwürfe werden nie ausgeliefert (Rows tragen keine Permissions).
 *
 * C18 — WARUM HIER EINE EIGENE WACHE STEHT: `pages`-Rows tragen bewusst KEINE
 * Row-Permissions, und diese Route liest mit der OPERATOR-Türklinke. Bei
 * comments/posts/events/media zieht das Umschalten der Sichtbarkeit die
 * Row-Permissions um und Appwrite hält Gäste selbst zurück — hier gibt es
 * nichts umzuziehen, also ist diese Zeile die EINZIGE Grenze. Ohne sie bliebe
 * die Startseite einer geschlossenen Community für jeden Gast lesbar.
 */
export default defineEventHandler(async (event): Promise<PublicPage> => {
  assertCommunityContentReadable(event, 'Page not found')

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }
  const requested = String(getQuery(event).locale || 'en').slice(0, 8)

  const res = await tenantDb(event, { as: 'operator' }).list<PageRow>(PAGES_TABLE, [
    Query.equal('slug', slug),
    Query.equal('status', 'published'),
    Query.limit(20),
  ]).catch((error) => {
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
