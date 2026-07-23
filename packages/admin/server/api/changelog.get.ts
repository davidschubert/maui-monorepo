import type { ChangelogListResponse } from '../../shared/types/admin'
import { compareChangelogByVersion, rowToChangelogEntry } from '../../shared/changelog'

const CATEGORIES = new Set(['feature', 'improvement', 'fix'])

/**
 * Öffentlich: veröffentlichte Changelog-Einträge — für den „Was ist neu"-Popover
 * UND die öffentliche /changelog-Seite. Paginiert (?page, ?limit≤50) mit
 * optionalem ?category-Filter; ohne Parameter wie bisher (20 neueste).
 * Sortierung nach Versionsnummer (in Code) → volles Set via Cursor-Pagination
 * (listAllChangelogRows), im Speicher paginieren.
 */
export default defineEventHandler(async (event): Promise<ChangelogListResponse> => {
  const query = getQuery(event)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))
  const page = Math.max(1, Number(query.page) || 1)
  const category = String(query.category ?? '')

  // Cross-Tenant-Cache-Regel (H3): auf tenancy-fähigen Apps trägt der Key den
  // Tenant, sonst leakt die Liste von Kunde A an Kunde B ('single' ohne Tenancy).
  const cacheKey = `${tenantCacheScope(event)}:${page}:${limit}:${category}`
  const cached = changelogCache.get(cacheKey)
  if (cached) return cached

  try {
    const { rows, total } = await listAllChangelogRows(event, {
      publishedOnly: true,
      category: CATEGORIES.has(category) ? category : undefined,
    })
    const all = rows.map(rowToChangelogEntry).sort(compareChangelogByVersion)
    const start = (page - 1) * limit
    const response = { total, entries: all.slice(start, start + limit) }
    changelogCache.set(cacheKey, response)
    return response
  }
  catch {
    return { total: 0, entries: [] }
  }
})
