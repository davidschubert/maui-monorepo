import { Query } from 'node-appwrite'
import { POSTS_TABLE, POST_VOTES_TABLE } from '../../shared/types/post'

/**
 * Die posts-Seite des Zähl-Vertrags (F1 Stufe 4): vergebene Upvotes und eigene
 * Beiträge nach erhaltenen Upvotes.
 *
 * ── SIEBEN `count`-ABFRAGEN, UND KEINE ZEILE WANDERT ──────────────────────
 * Eine für die vergebenen Stimmen, je eine pro Schwelle. `count` überträgt
 * bewusst nichts: die Alternative wäre, alle eigenen Beiträge zu laden und im
 * Speicher zu zählen — bei jemandem mit 800 Beiträgen sind das 32 Seiten, und
 * die Zahl der Abfragen hinge dann daran, wie lange jemand dabei ist. So ist
 * sie konstant. Die passenden Indizes legt posts-012 an.
 *
 * ── ZWEIMAL DIESELBE ZAHL, ZWEI NAMEN ─────────────────────────────────────
 * Jede Schwelle wird EINMAL gezählt und unter ZWEI Zählern gemeldet:
 * `likedItems` (alle Inhaltsarten zusammen, dort summiert sich `comments`
 * dazu) und `likedTopics` (nur eigenständige Beiträge). Das kostet keine
 * zusätzliche Abfrage und erspart dem Katalog die Frage, welcher Layer welche
 * Inhaltsart führt.
 *
 * ── NUR VERÖFFENTLICHTES ZÄHLT ────────────────────────────────────────────
 * Ein geplanter, ausgeblendeter oder gelöschter Beitrag ist kein Verdienst.
 * Bei den Stimmen fehlt der Filter mit Absicht: eine abgegebene Stimme bleibt
 * abgegeben, auch wenn ihr Ziel später verschwindet.
 *
 * ── MITGLIEDER-KLINKE, und das ist die enge Wahl ──────────────────────────
 * Gezählt wird ausschließlich Eigenes; die Row-Permissions reichen dafür und
 * bilden zusätzlich zur Datentür ein zweites Netz. `as: 'operator'` wäre hier
 * eine Klinke ohne Grund. Geschrieben wird nichts, Sperre (M13) und Beitritt
 * (A5) hängen am Schreiben — ein Zählvorgang löst also nichts aus.
 */
export default defineNitroPlugin(() => {
  registerUserCounterProvider('posts', async (event, { thresholds }) => {
    const userId = event.context.user?.$id
    if (!userId) return {}

    const db = tenantDb(event)

    const [likesGiven, ...perThreshold] = await Promise.all([
      db.count(POST_VOTES_TABLE, [
        Query.equal('userId', userId),
        Query.equal('value', 1),
      ]),
      ...thresholds.map(threshold => db.count(POSTS_TABLE, [
        Query.equal('authorId', userId),
        Query.equal('status', 'published'),
        Query.greaterThanEqual('upvotes', threshold),
      ])),
    ])

    const counters: Record<string, number> = { [COUNTER_LIKES_GIVEN]: likesGiven }
    thresholds.forEach((threshold, index) => {
      const measured = perThreshold[index] ?? 0
      counters[counterLikedItems(threshold)] = measured
      counters[counterLikedTopics(threshold)] = measured
    })
    return counters
  })
})
