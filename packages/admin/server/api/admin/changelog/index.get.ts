import { Query } from 'node-appwrite'
import type { ChangelogListResponse } from '../../../../shared/types/admin'
import { compareChangelogByVersion, rowToChangelogEntry, type ChangelogRow } from '../../../../shared/changelog'

const PAGE_SIZE = 25
const FETCH_CAP = 500

/** Admin: alle Changelog-Einträge (inkl. unveröffentlichter) zur Verwaltung. */
export default defineEventHandler(async (event): Promise<ChangelogListResponse> => {
  requirePermission(event, 'changelog.manage')

  const page = Math.max(1, Number(getQuery(event).page ?? 1) || 1)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  // Nach Versionsnummer sortiert (in Code) → volles Set holen, im Speicher paginieren.
  const res = await admin.tablesDB.listRows<ChangelogRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'changelog',
    queries: [Query.orderDesc('date'), Query.limit(FETCH_CAP)],
  })

  const all = res.rows.map(rowToChangelogEntry).sort(compareChangelogByVersion)
  const start = (page - 1) * PAGE_SIZE

  return { total: res.total, entries: all.slice(start, start + PAGE_SIZE) }
})
