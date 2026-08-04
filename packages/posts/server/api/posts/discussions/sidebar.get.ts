import { Query } from 'node-appwrite'
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
 * WAS „MEINE" HEISST: Kategorien, in denen ich GEPOSTET habe. Davids Vorgabe
 * sagt „gepostet ODER kommentiert" — der Kommentar-Teil fehlt weiterhin, und
 * in Stufe 2 ist das eine begründete Entscheidung statt einer Vertagung.
 *
 * ── WARUM ER NICHT NACHGEREICHT WURDE ──────────────────────────────────────
 * Die naheliegende Stelle wäre die Komposition in blueprint: sie DARF beide
 * Layer kennen (A14). Sie darf aber nichts anderes — `packages/blueprint`
 * hat bewusst kein `server/` (ESLint setzt das durch). Eine Komposition dort
 * kann also nur ZWEI HTTP-Abrufe hintereinanderhängen: erst „meine letzten
 * Kommentar-Ziele" beim comments-Layer, dann mit deren Ids die Kategorien
 * hier. Das kostet jeden angemeldeten Besucher eine zusätzliche
 * SSR-Wartekette auf JEDER Discussions-Seite.
 *
 * Der schwerere Einwand ist aber die REIHENFOLGE, und er ist strukturell: „die
 * letzten fünf" verlangt, meine Beiträge und meine Kommentare auf EINER
 * Zeitachse zu sortieren. Die Zeitstempel der Kommentare kennt nur der
 * comments-Layer, die der Beiträge nur dieser hier. Ohne eine gemeinsame
 * Serverseite bliebe nur, die Kommentar-Zeitstempel durch den CLIENT
 * zurückzureichen — eine Sortierung, die der Aufrufer bestimmt — oder zwei
 * Ranglisten zu vermengen, deren Skalen nicht vergleichbar sind (wer heute
 * fünfzig Beiträge schreibt und gestern einmal kommentiert hat, bekäme die
 * gestrige Kategorie nach vorn). Beides wäre eine Liste, die „zuletzt benutzt"
 * behauptet und etwas anderes zeigt.
 *
 * EHRLICH WÄRE EIN CORE-VERTRAG in der Bauart von `notifyContentActivity`
 * (Stufe 2, Stück 1): comments meldet auf Anfrage „diese Ziele, zu diesen
 * Zeiten", posts fragt ihn hier — eine Anfrage, keine Wartekette, kein
 * Aufrufer, der die Sortierung bestimmt. Das ist eine fünfte Registry und
 * damit eine Architektur-Entscheidung, keine Zugabe am Ende eines Umbaus.
 *
 * Die Auswirkung des Fehlens bleibt klein: wer irgendwo mitdiskutiert, hat
 * dort meistens auch selbst etwas eröffnet, und der Rückfall trägt den Rest.
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
    const { rows } = await db.list<CommunityPost>(POSTS_TABLE, [
      Query.equal('authorId', userId),
      Query.notEqual('categoryId', ''),
      Query.orderDesc('$createdAt'),
      Query.limit(OWN_POSTS_SCAN),
    ]).catch(() => ({ rows: [] as CommunityPost[] }))

    // Reihenfolge = zuletzt benutzt zuerst; Duplikate fallen still weg.
    const mine: PostCategory[] = []
    for (const row of rows) {
      const category = byId.get(row.categoryId)
      if (!category || mine.some(entry => entry.$id === category.$id)) continue
      mine.push(category)
      if (mine.length === SIDEBAR_SIZE) break
    }
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
