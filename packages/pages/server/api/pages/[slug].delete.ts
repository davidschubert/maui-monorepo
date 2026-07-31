import { Query } from 'node-appwrite'
import { PAGES_TABLE, type PageRow } from '../../../shared/types/page'

/** Admin: eine Seite (alle Sprachversionen) löschen. */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'pages.manage')
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  const db = tenantDb(event, { as: 'operator' })
  const res = await db.list<PageRow>(PAGES_TABLE, [
    Query.equal('slug', slug),
    Query.limit(50),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not delete page')
  })

  await Promise.all(res.rows.map(row => db.remove(PAGES_TABLE, row.$id)))
    .catch((error) => {
      throw toH3Error(error, 'Could not delete page')
    })

  return { deleted: res.rows.length }
})
