import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { ChangelogEntry, ChangelogListResponse } from '../../shared/types/admin'

type Row = Models.Row & Omit<ChangelogEntry, '$id' | '$createdAt'>

const CATEGORIES = new Set(['feature', 'improvement', 'fix'])

/**
 * Öffentlich: veröffentlichte Changelog-Einträge — für den „Was ist neu"-Popover
 * UND die öffentliche /changelog-Seite. Paginiert (?page, ?limit≤50) mit
 * optionalem ?category-Filter; ohne Parameter wie bisher (20 neueste).
 */
export default defineEventHandler(async (event): Promise<ChangelogListResponse> => {
  const query = getQuery(event)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const page = Math.max(1, Number(query.page) || 1)
  const category = String(query.category ?? '')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const queries = [
    Query.equal('published', true),
    Query.orderDesc('date'),
    Query.limit(limit),
    Query.offset((page - 1) * limit),
  ]
  if (CATEGORIES.has(category)) queries.push(Query.equal('category', category))
  try {
    const res = await admin.tablesDB.listRows<Row>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'changelog',
      queries,
    })
    return {
      total: res.total,
      entries: res.rows.map(r => ({
        $id: r.$id, $createdAt: r.$createdAt, date: r.date ?? r.$createdAt, title: r.title, body: r.body,
        titleEn: r.titleEn ?? '', bodyEn: r.bodyEn ?? '',
        category: r.category ?? '', version: r.version ?? '', published: r.published,
      })),
    }
  }
  catch {
    return { total: 0, entries: [] }
  }
})
