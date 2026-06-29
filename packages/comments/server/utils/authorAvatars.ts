import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Löst Avatar-URLs für eine Menge von Autoren-IDs auf (aus den Account-prefs).
 * Ein gebündelter users.list-Query statt N Einzelabrufe; bei fehlendem Scope
 * oder Fehler leere Map (UI fällt auf Initialen zurück).
 */
export async function resolveAuthorAvatars(event: H3Event, authorIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(authorIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const map = new Map<string, string>()
  try {
    const admin = createAdminClient(event)
    // Query.equal ist auf 100 Werte begrenzt → in Batches (Thread-Subtrees können groß sein)
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
