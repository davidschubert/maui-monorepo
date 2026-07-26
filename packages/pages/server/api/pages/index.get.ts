import { Query } from 'node-appwrite'
import { PAGES_TABLE, type PageGroup, type PageRow } from '../../../shared/types/page'

/** Admin: alle Seiten, nach slug gruppiert (das aufklappbare Menü). */
export default defineEventHandler(async (event): Promise<{ groups: PageGroup[] }> => {
  await requireSitePermission(event, 'pages.manage')

  // Datentür statt Hand-Scope (scopeQuery) — gleicher Filter, eine Autorität.
  const res = await tenantDb(event, { as: 'operator' }).list<PageRow>(PAGES_TABLE, [
    Query.orderAsc('sortOrder'),
    Query.limit(500),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load pages')
  })

  const bySlug = new Map<string, PageGroup>()
  for (const row of res.rows) {
    let group = bySlug.get(row.slug)
    if (!group) {
      group = { slug: row.slug, sortOrder: row.sortOrder, locales: [] }
      bySlug.set(row.slug, group)
    }
    group.sortOrder = Math.min(group.sortOrder, row.sortOrder)
    group.locales.push({ $id: row.$id, locale: row.locale, title: row.title, status: row.status })
  }
  const groups = [...bySlug.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
  return { groups }
})
