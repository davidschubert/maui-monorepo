import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminAnalytics } from '../../../shared/types/admin'

const ALLOWED_DAYS = [7, 30, 90]
const SAMPLE = 200 // jüngste Ereignisse, die wir bucketen (Dev-Maßstab)

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Tages-Zeitreihe (letzte 30 Tage) für Registrierungen + Kommentare.
 * Einfaches Bucketing der jüngsten Ereignisse — für große Datenmengen später
 * serverseitige Aggregation. Admin-only.
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
  const [users, comments, usersInRange, commentsInRange] = await Promise.all([
    // Sample für die Tages-Buckets (Chart-Form)
    admin.users.list({ queries: [Query.orderDesc('$createdAt'), Query.limit(SAMPLE)] })
      .catch(() => ({ users: [] as Models.User<Models.Preferences>[] })),
    admin.tablesDB.listRows({
      databaseId: dbId,
      tableId: 'comments',
      queries: [Query.orderDesc('$createdAt'), Query.limit(SAMPLE)],
    }).catch(() => ({ rows: [] as Models.Row[] })),
    // KPI-Totals autoritativ per Count (Query.limit(1) → r.total), nicht aus dem
    // Sample summiert — sonst untercounted bei breiten Zeiträumen/aktiven Tagen.
    admin.users.list({ queries: [Query.greaterThanEqual('$createdAt', cutoffIso), Query.limit(1)] })
      .then(r => r.total).catch(() => 0),
    admin.tablesDB.listRows({
      databaseId: dbId,
      tableId: 'comments',
      queries: [Query.greaterThanEqual('$createdAt', cutoffIso), Query.limit(1)],
    }).then(r => r.total).catch(() => 0),
  ])

  const buckets = new Map<string, { users: number, comments: number }>()
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(cutoff)
    d.setUTCDate(d.getUTCDate() + i)
    buckets.set(dayKey(d), { users: 0, comments: 0 })
  }

  for (const u of users.users) {
    const bucket = buckets.get(dayKey(new Date(u.$createdAt)))
    if (bucket) bucket.users++
  }
  for (const c of comments.rows) {
    const bucket = buckets.get(dayKey(new Date(c.$createdAt)))
    if (bucket) bucket.comments++
  }

  const points = [...buckets.entries()].map(([date, value]) => ({ date, users: value.users, comments: value.comments }))

  return {
    rangeDays: DAYS,
    points,
    usersInRange,
    commentsInRange,
  }
})
