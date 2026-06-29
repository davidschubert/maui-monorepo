import { Query } from 'node-appwrite'
import type { ChangelogListResponse } from '../../shared/types/admin'
import { compareChangelogByVersion, rowToChangelogEntry, type ChangelogRow } from '../../shared/changelog'

const CATEGORIES = new Set(['feature', 'improvement', 'fix'])
// Sortierung erfolgt nach Versionsnummer (in Code), daher das volle Set holen
// und im Speicher paginieren — für ein Changelog unkritisch.
const FETCH_CAP = 500

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
    Query.limit(FETCH_CAP),
  ]
  if (CATEGORIES.has(category)) queries.push(Query.equal('category', category))
  try {
    const res = await admin.tablesDB.listRows<ChangelogRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'changelog',
      queries,
    })
    const all = res.rows.map(rowToChangelogEntry).sort(compareChangelogByVersion)
    const start = (page - 1) * limit
    return { total: res.total, entries: all.slice(start, start + limit) }
  }
  catch {
    return { total: 0, entries: [] }
  }
})
