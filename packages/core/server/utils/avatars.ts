import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Avatar-URLs (Account-prefs) für eine Menge User-IDs auflösen — ein gebündelter
 * users.list-Query statt N Einzelabrufe, in 100er-Batches (Query.equal ist auf
 * 100 Werte begrenzt). Bei fehlendem Scope/Fehler leere Map (UI fällt auf
 * Initialen zurück). Auto-importiert in alle Server-Routen (geteilter Core-Util).
 */
export async function resolveAvatars(event: H3Event, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const map = new Map<string, string>()
  try {
    const admin = createAdminClient(event)
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const res = await admin.users.list({ queries: [Query.equal('$id', batch), Query.limit(batch.length)] })
      for (const user of res.users) {
        const url = (user.prefs as { avatarUrl?: string })?.avatarUrl
        if (typeof url === 'string' && url.length > 0) map.set(user.$id, url)
      }
    }
    return map
  }
  catch {
    return new Map()
  }
}
