import { Query } from 'node-appwrite'
import { COMMENTS_TABLE, VOTES_TABLE } from '../../shared/types/comment'

/**
 * Die comments-Seite des Zähl-Vertrags (F1 Stufe 4): vergebene Upvotes und
 * eigene ANTWORTEN nach erhaltenen Upvotes.
 *
 * Das Gegenstück zum posts-Provider, mit denselben sieben `count`-Abfragen und
 * derselben Begründung (dort ausführlich). Der Unterschied ist der zweite
 * Zähler-Name: hier `likedReplies`, dort `likedTopics`. Beide melden zusätzlich
 * `likedItems` — die Summe über alle Inhaltsarten, die die Gemeinschafts-
 * Abzeichen meinen.
 *
 * DIESER LAYER WEISS WEITERHIN NICHT, DASS ES BEITRÄGE GIBT (A14). Er nennt
 * einen Zähler, keinen Nachbarn — die Namen gehören dem Core-Vertrag.
 *
 * NUR SICHTBARE ANTWORTEN ZÄHLEN (`status: 'active'`): eine ausgeblendete oder
 * gelöschte Antwort ist kein Verdienst. Bei den vergebenen Stimmen fehlt der
 * Filter mit Absicht — eine abgegebene Stimme bleibt abgegeben, auch wenn ihr
 * Ziel später verschwindet.
 *
 * GAST-KOMMENTARE fallen von selbst heraus: sie tragen `authorId: ''`, und
 * gezählt wird gegen die Id des Angemeldeten.
 */
export default defineNitroPlugin(() => {
  registerUserCounterProvider('comments', async (event, { thresholds }) => {
    const userId = event.context.user?.$id
    if (!userId) return {}

    const db = tenantDb(event)

    const [likesGiven, ...perThreshold] = await Promise.all([
      db.count(VOTES_TABLE, [
        Query.equal('userId', userId),
        Query.equal('value', 1),
      ]),
      ...thresholds.map(threshold => db.count(COMMENTS_TABLE, [
        Query.equal('authorId', userId),
        Query.equal('status', 'active'),
        Query.greaterThanEqual('upvotes', threshold),
      ])),
    ])

    const counters: Record<string, number> = { [COUNTER_LIKES_GIVEN]: likesGiven }
    thresholds.forEach((threshold, index) => {
      const measured = perThreshold[index] ?? 0
      counters[counterLikedItems(threshold)] = measured
      counters[counterLikedReplies(threshold)] = measured
    })
    return counters
  })
})
