import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { ChangelogRow } from '../../shared/changelog'

// Batch-Größe der Cursor-Pagination; die harte Grenze ist nur ein Notanker
// gegen entgleisende Pagination (mit Log statt stillem Kappen).
const PAGE = 500
const HARD_CAP = 5_000

/**
 * ALLE Changelog-Rows per Cursor einsammeln (die Sortierung nach Versionsnummer
 * passiert in Code — dafür braucht es das volle Set, ein einzelnes 500er-Fenster
 * würde alte Einträge still verlieren). Filter (published/category) optional.
 */
export async function listAllChangelogRows(
  event: H3Event,
  opts: { publishedOnly?: boolean, category?: string } = {},
): Promise<{ rows: ChangelogRow[], total: number }> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const filters: string[] = []
  if (opts.publishedOnly) filters.push(Query.equal('published', true))
  if (opts.category) filters.push(Query.equal('category', opts.category))

  const rows: ChangelogRow[] = []
  let total = 0
  let cursor: string | undefined
  while (rows.length < HARD_CAP) {
    const res = await admin.tablesDB.listRows<ChangelogRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'changelog',
      queries: [
        ...filters,
        Query.orderDesc('date'),
        Query.limit(PAGE),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ],
    })
    total = res.total
    rows.push(...res.rows)
    if (res.rows.length < PAGE) break
    cursor = res.rows.at(-1)!.$id
  }
  if (rows.length >= HARD_CAP) {
    console.warn(`[changelog] Einträge an HARD_CAP (${HARD_CAP}) gekappt — Versions-Sortierung ist dann unvollständig.`)
  }
  return { rows, total }
}
