import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Anzeigenamen für eine Menge User-IDs auflösen — EIN gebündelter
 * `users.list`-Query statt N Einzelabrufe, in 100er-Batches (`Query.equal` ist
 * auf 100 Werte begrenzt). Schwester von `resolveAvatars` nebenan, gleiche
 * Bauart und gleiche Zusagen.
 *
 * FAIL-SOFT: fehlender Scope, fehlendes Konto oder ein Lesefehler ⇒ der Name
 * fehlt in der Karte. Ein Name ist eine Höflichkeit, kein Datum, an dem eine
 * Seite hängen darf — die Oberfläche fällt auf die Id oder einen Platzhalter
 * zurück.
 *
 * NICHT für Listen mit fremden Inhalten gedacht, die den Namen ohnehin
 * denormalisiert tragen (`authorName` an `community_posts`): dort wäre dieser
 * Aufruf eine zweite Wahrheit über denselben Menschen. Gedacht ist er für
 * Tabellen, die nur Ids führen — die Zähler-Zeilen der Stufen-Verwaltung sind
 * der erste Fall.
 */
export async function resolveUserNames(event: H3Event, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const map = new Map<string, string>()
  try {
    const admin = createAdminClient(event)
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const res = await admin.users.list({ queries: [Query.equal('$id', batch), Query.limit(batch.length)] })
      for (const user of res.users) {
        if (user.name) map.set(user.$id, user.name)
      }
    }
    return map
  }
  catch {
    return new Map()
  }
}
