import type { ChangelogListResponse } from '../../../../shared/types/admin'
import { compareChangelogByVersion, rowToChangelogEntry } from '../../../../shared/changelog'

const PAGE_SIZE = 25

/** Admin: alle Changelog-Einträge (inkl. unveröffentlichter) zur Verwaltung. */
export default defineEventHandler(async (event): Promise<ChangelogListResponse> => {
  requirePermission(event, 'changelog.manage')

  const page = Math.max(1, Number(getQuery(event).page ?? 1) || 1)

  // Nach Versionsnummer sortiert (in Code) → volles Set via Cursor-Pagination
  // (listAllChangelogRows), im Speicher paginieren.
  const { rows, total } = await listAllChangelogRows(event)
  const all = rows.map(rowToChangelogEntry).sort(compareChangelogByVersion)
  const start = (page - 1) * PAGE_SIZE

  return { total, entries: all.slice(start, start + PAGE_SIZE) }
})
