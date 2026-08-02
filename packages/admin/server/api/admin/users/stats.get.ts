import { Query } from 'node-appwrite'
import { type ProjectUserCounts, projectUserCounts } from '../../../utils/userStatsCache'

/** accessedAt ist bei Appwrite nicht queryfähig → Scan mit Notanker-Kappe */
const FETCH_PAGE = 100
const FETCH_HARD_CAP = 5_000

/**
 * Zähler für die People-Navigation (Alle/Aktiv/Neu/Online). „Neu" kommt als
 * server-seitige registration-Query; „Aktiv" (accessedAt) muss gescannt
 * werden — gecacht (60 s), Kappe dokumentiert.
 *
 * GECACHT WIRD NUR DAS PROJEKTWEITE (Nacht-Audit 2026-08-02, F23). „Online"
 * ist mandantengescopt und wurde vom prozessweiten, ungeschlüsselten Cache
 * über Community-Grenzen getragen; es kommt jetzt bei jedem Request frisch.
 * Begründung samt Abwägung gegen einen mandantengeschlüsselten Cache:
 * server/utils/userStatsCache.ts.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

  const admin = createAdminClient(event)
  const projectId = useRuntimeConfig(event).public.appwriteProjectId

  const counts = await projectUserCounts(projectId, async (): Promise<ProjectUserCounts> => {
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

    return { total: totalRes.total, active, new: newRes.total }
  })

  // „Online" = echte Anwesenheit über die Presences API (kein Scan nötig, also
  // auch kein Grund, es zu cachen) — und MANDANTEN-gescopt, gehört damit
  // niemals in einen projektweiten Cache.
  const online = (await listOnlinePresences(event)).length

  return { ...counts, online }
})
