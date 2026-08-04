import { Query } from 'node-appwrite'
import { recentCategoryIds, type CategoryTouch } from '../../../../shared/sidebarCategories'
import {
  POSTS_TABLE,
  type CommunityPost,
  type DiscussionSidebarResponse,
  type PostCategory,
} from '../../../../shared/types/post'

/** Wie viele Kategorien in der Seitenleiste stehen (Davids Entscheidung 7). */
const SIDEBAR_SIZE = 5

/**
 * Wie weit zurück nach eigener Aktivität gesucht wird. 50 eigene Beiträge
 * reichen für fünf verschiedene Kategorien bei weitem; eine größere Zahl
 * machte die Seitenleiste teurer, ohne ihr Ergebnis zu ändern.
 */
const OWN_POSTS_SCAN = 50

/**
 * Die Seitenleiste der Discussions: meine letzten Kategorien — und ohne eigene
 * Aktivität die fünf größten (Davids Entscheidung 7 vom 2026-08-03).
 *
 * ── DIE KOMMENTAR-HÄLFTE IST SEIT STUFE 3 DA ───────────────────────────────
 * „Meine" heißt jetzt, was Davids Vorgabe immer meinte: Kategorien, in denen
 * ich GEPOSTET **ODER KOMMENTIERT** habe. Stufe 2 hat die zweite Hälfte
 * bewusst nicht nachgereicht, und die damalige Begründung ist genau der Grund,
 * warum sie jetzt so und nicht anders gebaut ist:
 *
 *   „Die letzten fünf" verlangt, Beiträge und Kommentare auf EINER Zeitachse
 *   zu ordnen. Die Zeitstempel der Kommentare kennt nur `comments`, die der
 *   Beiträge nur dieser Layer. Zwei HTTP-Abrufe in der blueprint-Komposition
 *   hintereinanderzuhängen hätte bedeutet, die Sortierung dem CLIENT zu
 *   überlassen — also dem Aufrufer.
 *
 * Gelöst über den fünften Core-Vertrag (`collectUserActivity`): eine Frage,
 * alle Quellen antworten, EIN Server führt zusammen. `comments` meldet dabei
 * nur „Ziel-Typ, Ziel-Id, Zeitpunkt" und weiß bis heute nicht, dass es
 * Kategorien gibt (A14). Was ein 'post' ist, weiß dieser Layer.
 *
 * ── DIE KOSTEN, EHRLICH ────────────────────────────────────────────────────
 * Zwei zusätzliche Abfragen für angemeldete Besucher: die des comments-Layers
 * (eine, gedeckelt) und EINE gebündelte hier, die zu den gemeldeten Ids die
 * Kategorien holt. Kein N+1 — und keine für Gäste, die fallen sofort in den
 * Rückfall.
 *
 * `source` sagt der Oberfläche, welche Überschrift wahr ist — „Deine
 * Kategorien" über den fünf größten wäre eine Lüge.
 */
export default defineEventHandler(async (event): Promise<DiscussionSidebarResponse> => {
  requirePlanProduct(event, 'posts')

  const db = tenantDb(event)
  const categories = await listCategories(db, { activeOnly: true })
  if (categories.length === 0) return { rows: [], source: 'largest' }

  const byId = new Map(categories.map(category => [category.$id, category]))
  const userId = event.context.user?.$id

  if (userId) {
    /**
     * Beide Quellen parallel: sie wissen nichts voneinander, also gibt es
     * keinen Grund, die eine auf die andere warten zu lassen.
     */
    const [ownPosts, commented] = await Promise.all([
      db.list<CommunityPost>(POSTS_TABLE, [
        Query.equal('authorId', userId),
        Query.notEqual('categoryId', ''),
        Query.orderDesc('$createdAt'),
        Query.limit(OWN_POSTS_SCAN),
      ]).catch(() => ({ rows: [] as CommunityPost[] })),
      /**
       * Mehr Ziele erfragen als Kategorien gebraucht werden: mehrere Themen
       * können in derselben Kategorie hängen, und dann bliebe von fünf Zielen
       * eine einzige Kategorie übrig.
       */
      collectUserActivity(event, userId, SIDEBAR_SIZE * 4),
    ])

    const touches: CategoryTouch[] = ownPosts.rows.map(row => ({
      categoryId: row.categoryId,
      // Das ANLEGEN des Beitrags, nicht seine letzte Aktivität: die Frage
      // lautet „wann war ICH dort", und eine fremde Antwort unter meinem Thema
      // ist keine Handlung von mir.
      at: row.$createdAt,
    }))

    /**
     * Nur Ziele vom Typ 'post' — ein Ticket-Kommentar führt in keine Kategorie.
     * Der Vertrag liefert bewusst alles und überlässt die Auswahl dem, der
     * weiß, was er damit anfangen kann.
     */
    const postIds = [...new Set(commented.filter(entry => entry.targetType === 'post').map(entry => entry.targetId))]
    if (postIds.length > 0) {
      const commentedAt = new Map(commented.map(entry => [entry.targetId, entry.at]))
      /**
       * EINE gebündelte Abfrage für alle kommentierten Themen. Sie läuft durch
       * die Datentür: ein Kommentar an einem Beitrag aus einer fremden
       * Community (Mehrfach-Mitgliedschaft) findet hier nichts und fällt still
       * heraus — die Seitenleiste bleibt mandantendicht.
       *
       * `Query.equal` verträgt 100 Werte; `postIds` ist durch das
       * Vierfache der Seitenleisten-Größe weit darunter.
       */
      const { rows } = await db.list<CommunityPost>(POSTS_TABLE, [
        Query.equal('$id', postIds),
        Query.notEqual('categoryId', ''),
        Query.limit(postIds.length),
      ]).catch(() => ({ rows: [] as CommunityPost[] }))

      for (const row of rows) {
        const at = commentedAt.get(row.$id)
        if (at) touches.push({ categoryId: row.categoryId, at })
      }
    }

    /**
     * EINE Zeitachse, pur und getestet. Erst hier entscheidet sich die
     * Reihenfolge — und zwar unabhängig davon, in welcher Reihenfolge die
     * beiden Quellen oben geantwortet haben.
     */
    const mine = recentCategoryIds(touches, SIDEBAR_SIZE)
      .map(id => byId.get(id))
      .filter((category): category is PostCategory => category !== undefined)

    // BEWUSST kein Auffüllen mit den größten: „ohne eigene Aktivität" heißt
    // ohne JEDE — wer in zwei Kategorien schreibt, sieht zwei, keine fünf mit
    // drei fremden dazwischen.
    if (mine.length > 0) return { rows: mine, source: 'mine' }
  }

  const counts = await topicCountsFor(db, categories)
  const largest = [...categories]
    .sort((a, b) => (counts.get(b.$id) ?? 0) - (counts.get(a.$id) ?? 0))
    .slice(0, SIDEBAR_SIZE)

  return { rows: largest, source: 'largest' }
})
