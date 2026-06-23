import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { ChangelogEntry, ChangelogListResponse } from '../../../../shared/types/admin'

const PAGE_SIZE = 25
type Row = Models.Row & Omit<ChangelogEntry, '$id' | '$createdAt'>

/** Admin: alle Changelog-Einträge (inkl. unveröffentlichter) zur Verwaltung. */
export default defineEventHandler(async (event): Promise<ChangelogListResponse> => {
  requireAdmin(event)

  const page = Math.max(1, Number(getQuery(event).page ?? 1) || 1)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const res = await admin.tablesDB.listRows<Row>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'changelog',
    queries: [Query.orderDesc('date'), Query.limit(PAGE_SIZE), Query.offset((page - 1) * PAGE_SIZE)],
  })

  return {
    total: res.total,
    entries: res.rows.map(r => ({
      $id: r.$id, $createdAt: r.$createdAt, date: r.date ?? r.$createdAt, title: r.title, body: r.body,
      category: r.category ?? '', version: r.version ?? '', published: r.published,
    })),
  }
})
