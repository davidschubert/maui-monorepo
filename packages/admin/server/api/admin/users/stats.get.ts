import { Query } from 'node-appwrite'

/** accessedAt ist bei Appwrite nicht queryfähig → Scan mit Notanker-Kappe */
const FETCH_PAGE = 100
const FETCH_HARD_CAP = 5_000

/** Nav-Badges werden bei jedem Dashboard-Render gebraucht → kurzer Cache */
const CACHE_TTL_MS = 60_000
let cache: { at: number, value: { total: number, active: number, new: number } } | null = null

/**
 * Zähler für die People-Navigation (Alle/Aktiv/Neu). „Neu" kommt als
 * server-seitige registration-Query; „Aktiv" (accessedAt) muss gescannt
 * werden — gecacht (60 s), Kappe dokumentiert.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value
  }

  const admin = createAdminClient(event)
  const now = Date.now()

  const [totalRes, newRes] = await Promise.all([
    admin.users.list({ queries: [Query.limit(1)] }),
    admin.users.list({
      queries: [Query.greaterThan('registration', new Date(now - USERS_NEW_WINDOW_MS).toISOString()), Query.limit(1)],
    }),
  ])

  let active = 0
  let scanned = 0
  let cursor: string | undefined
  const cutoff = now - USERS_ACTIVE_WINDOW_MS
  while (scanned < FETCH_HARD_CAP) {
    const res = await admin.users.list({
      queries: [Query.limit(FETCH_PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
    })
    for (const user of res.users) {
      if (user.accessedAt && Date.parse(user.accessedAt) >= cutoff) active++
    }
    scanned += res.users.length
    if (res.users.length < FETCH_PAGE) break
    cursor = res.users.at(-1)!.$id
  }
  if (scanned >= FETCH_HARD_CAP) {
    console.warn(`[admin] users/stats-Scan an FETCH_HARD_CAP (${FETCH_HARD_CAP}) gekappt — active-Zähler untertreibt`)
  }

  const value = { total: totalRes.total, active, new: newRes.total }
  cache = { at: Date.now(), value }
  return value
})
