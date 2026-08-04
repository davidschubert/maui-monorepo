import { Query } from 'node-appwrite'
import { guidelinesFallbackGroup } from '../../../shared/guidelinesFallback'
import { GUIDELINES_SLUG, PAGES_TABLE, type PageGroup, type PageRow } from '../../../shared/types/page'

/** Admin: alle Seiten, nach slug gruppiert (das aufklappbare Menü). */
export default defineEventHandler(async (event): Promise<{ groups: PageGroup[] }> => {
  await requireCommunityPermission(event, 'pages.manage')

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
  // Die Regeln stehen in der Liste, auch wenn es sie als Zeile noch nicht gibt
  // — sonst wäre der bearbeitbare Standardtext für den Owner unauffindbar und
  // er müsste ihn abtippen (F1, Davids Entscheidung 2). Hier braucht es KEINE
  // zweite Abfrage: diese Liste ist ungefiltert, ein Entwurf stünde also schon
  // in `bySlug`.
  const rawGroups = [...bySlug.values()]
  if (!bySlug.has(GUIDELINES_SLUG) && guidelinesFallbackEnabled()) rawGroups.push(guidelinesFallbackGroup())

  const groups = rawGroups.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
  return { groups }
})
