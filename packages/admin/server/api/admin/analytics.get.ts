import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminAnalytics } from '../../../shared/types/admin'

const ALLOWED_DAYS = [7, 30, 90]
const PAGE = 100
// Sicherheitskappe je Reihe (~10k Rows). Bei Dev-Maßstab nie erreicht; verhindert
// im Extremfall eine entgleisende Pagination. Wird sie getroffen, undercounten
// Chart UND Total gemeinsam (konsistent) — siehe Warnung unten.
const MAX_PAGES = 100

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Alle `$createdAt`-Werte ab `cutoffIso` paginiert einsammeln. */
async function collectCreatedAt(
  total: { count: number, capped: boolean },
  loadPage: (offset: number) => Promise<{ createdAt: string[], total: number }>,
): Promise<string[]> {
  const out: string[] = []
  let offset = 0
  for (let p = 0; p < MAX_PAGES; p++) {
    const res = await loadPage(offset).catch(() => null)
    if (!res) break
    out.push(...res.createdAt)
    total.count = res.total
    if (res.createdAt.length < PAGE || offset + res.createdAt.length >= res.total) {
      total.capped = false
      return out
    }
    offset += PAGE
  }
  total.capped = true
  return out
}

/**
 * Tages-Zeitreihe für Registrierungen + Kommentare im gewählten Zeitraum.
 * Chart-Buckets UND KPI-Totals stammen aus DERSELBEN paginierten In-Range-Menge
 * → Balken und Legende können nicht auseinanderlaufen (früher: 200er-Sample für
 * die Buckets vs. autoritative Count-Query für die Totals). Admin-only.
 */
export default defineEventHandler(async (event): Promise<AdminAnalytics> => {
  requireAdmin(event)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const requested = Number(getQuery(event).days ?? 30)
  const DAYS = ALLOWED_DAYS.includes(requested) ? requested : 30

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setUTCDate(cutoff.getUTCDate() - (DAYS - 1))
  const cutoffIso = cutoff.toISOString()

  const dbId = config.public.appwriteDatabaseId
  const userTotal = { count: 0, capped: false }
  const commentTotal = { count: 0, capped: false }

  const [userDates, commentDates] = await Promise.all([
    collectCreatedAt(userTotal, async (offset) => {
      const r = await admin.users.list({
        queries: [Query.greaterThanEqual('$createdAt', cutoffIso), Query.orderDesc('$createdAt'), Query.limit(PAGE), Query.offset(offset)],
      })
      return { createdAt: r.users.map(u => u.$createdAt), total: r.total }
    }),
    collectCreatedAt(commentTotal, async (offset) => {
      const r = await admin.tablesDB.listRows<Models.Row>({
        databaseId: dbId,
        tableId: 'comments',
        queries: [Query.greaterThanEqual('$createdAt', cutoffIso), Query.orderDesc('$createdAt'), Query.limit(PAGE), Query.offset(offset)],
      })
      return { createdAt: r.rows.map(row => row.$createdAt), total: r.total }
    }),
  ])

  if (userTotal.capped || commentTotal.capped) {
    console.warn(`[analytics] In-Range-Menge an MAX_PAGES (${MAX_PAGES * PAGE}) gekappt — Chart/Total untercounten.`)
  }

  const buckets = new Map<string, { users: number, comments: number }>()
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(cutoff)
    d.setUTCDate(d.getUTCDate() + i)
    buckets.set(dayKey(d), { users: 0, comments: 0 })
  }

  for (const iso of userDates) {
    const bucket = buckets.get(dayKey(new Date(iso)))
    if (bucket) bucket.users++
  }
  for (const iso of commentDates) {
    const bucket = buckets.get(dayKey(new Date(iso)))
    if (bucket) bucket.comments++
  }

  const points = [...buckets.entries()].map(([date, value]) => ({ date, users: value.users, comments: value.comments }))

  return {
    rangeDays: DAYS,
    points,
    // Totals aus derselben Menge wie die Buckets → konsistent mit dem Chart.
    usersInRange: userDates.length,
    commentsInRange: commentDates.length,
  }
})
