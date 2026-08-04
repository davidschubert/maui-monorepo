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
 * WAS „MEINE" IN STUFE 1 HEISST: Kategorien, in denen ich GEPOSTET habe.
 * Davids Vorgabe sagt „gepostet ODER kommentiert" — der Kommentar-Teil fehlt
 * bewusst: Kommentare gehören dem comments-Layer, und ein Produkt-Layer darf
 * einen anderen nicht kennen (A14). Ehrlich wäre erst ein Core-Vertrag, über
 * den comments seine Beteiligung meldet — neue Infrastruktur, also Stufe 2.
 * Die Auswirkung ist klein: wer irgendwo mitdiskutiert, hat dort meistens auch
 * selbst etwas eröffnet, und der Rückfall trägt den Rest.
 *
 * `source` sagt der Oberfläche, welche Überschrift wahr ist — „Deine
 * Kategorien" über den fünf größten wäre eine Lüge.
 */
export default defineEventHandler(async (event): Promise<DiscussionSidebarResponse> => {
  requirePlanProduct(event, 'posts')

  const categories = await listCategories(event, { activeOnly: true })
  if (categories.length === 0) return { rows: [], source: 'largest' }

  const byId = new Map(categories.map(category => [category.$id, category]))
  const userId = event.context.user?.$id

  if (userId) {
    const { rows } = await tenantDb(event).list<CommunityPost>(POSTS_TABLE, [
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

  const counts = await topicCountsFor(event, categories)
  const largest = [...categories]
    .sort((a, b) => (counts.get(b.$id) ?? 0) - (counts.get(a.$id) ?? 0))
    .slice(0, SIDEBAR_SIZE)

  return { rows: largest, source: 'largest' }
})
