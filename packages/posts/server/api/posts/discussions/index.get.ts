import { Query } from 'node-appwrite'
import { parseTopicFilters } from '../../../../shared/discussionFilters'
import { isTopPeriod, isTopicOrder, periodStartIso } from '../../../../shared/discussionSort'
import {
  POSTS_TABLE,
  type CommunityPost,
  type DiscussionListResponse,
  type DiscussionTopic,
} from '../../../../shared/types/post'

const PAGE_SIZE = 25

/**
 * Die Topic-Liste der Discussions (F1 Stufe 1).
 *
 * WAS EIN TOPIC IST: ein Beitrag MIT Kategorie. Kategorisierte Beiträge
 * bleiben im Feed (Davids Entscheidung 2 — eine Community hat EINEN Ort);
 * Discussions ist die nach Kategorien gegliederte Sicht auf denselben Bestand,
 * kein zweiter Datentopf. Ein Beitrag ohne Kategorie erscheint deshalb hier
 * nicht — er hat keinen Platz in einer Struktur, der er nicht angehört.
 *
 * Filter: `category` (Slug) · `created-after` (YYYY-MM-DD oder `Nd`) ·
 * `created-before` (YYYY-MM-DD) · `author` (Row-Id) · `pinned` (`1`) ·
 * `state` (any|open|closed) · `solution` (any|solved|unsolved) ·
 * `order` (latest|top) · `period` (nur bei top) · `q` (Titel-Suche).
 * Unbekannte Werte werden IGNORIERT statt mit 400 beantwortet: das hier ist
 * eine öffentliche Liste, und ein vertippter Query-Parameter in einem
 * geteilten Link soll eine leere Seite nicht in einen Fehler verwandeln.
 *
 * Gelesen werden die Filter aus EINER puren Regel (shared/discussionFilters.ts).
 * Dort steht auch, welche sechs Kästchen aus Davids Katalog BEWUSST fehlen und
 * warum — kurz: sie wären entweder wirkungslos (Erstbeitrag, nur im Titel),
 * gegenstandslos (Bilder, Wiki, Archiv, öffentlich) oder unehrlich
 * (Antworten- und Aufruf-Zahlen, die nicht auf der Zeile stehen).
 */
export default defineEventHandler(async (event): Promise<DiscussionListResponse> => {
  // Produkt-Gate (P4): Discussions sitzt auf `posts` — siehe product.manifest.ts.
  requirePlanProduct(event, 'posts')
  // Dieselbe Vorab-Veröffentlichung wie im Feed: ein geplanter Beitrag mit
  // Kategorie soll nicht darauf warten, dass jemand den Feed öffnet.
  await publishDuePosts(event)

  const query = getQuery(event)
  // Datentür (member): Gäste sehen nur Zeilen mit passender Read-Permission,
  // der Mandanten-Filter liegt als Netz darunter.
  const db = tenantDb(event)
  const categories = await listCategories(db)
  if (categories.length === 0) return { rows: [], nextCursor: null }

  const byId = new Map(categories.map(category => [category.$id, category]))

  // F1 Stufe 3: ALLE erweiterten Filter kommen aus EINER puren, getesteten
  // Regel — was sie NICHT kann und warum, steht vollständig in ihrem Kopf
  // (shared/discussionFilters.ts). Diese Route setzt sie nur in Queries um.
  const filters = parseTopicFilters(query as Record<string, unknown>)

  const requestedSlug = filters.category
  const selected = requestedSlug ? categories.find(category => category.slug === requestedSlug) : undefined
  if (requestedSlug && !selected) {
    // Unbekannte Kategorie in der URL: leere Liste statt 404. Über 404 oder
    // nicht entscheidet die SEITE (die kennt den Unterschied zwischen „Filter
    // im Query" und „Kategorie im Pfad"), nicht diese Route.
    return { rows: [], nextCursor: null }
  }

  const order = isTopicOrder(query.order) ? query.order : 'latest'
  const period = isTopPeriod(query.period) ? query.period : 'all'

  /**
   * ZWEI Zeitfenster können gleichzeitig gelten (der Zeitraum von „Top" und
   * der Filter `created-after`). Zwei `greaterThanEqual` auf dieselbe Spalte
   * würde Appwrite zwar UND-verknüpfen, aber das SPÄTERE gewinnt ohnehin —
   * hier steht es ausgerechnet statt zweimal gefragt.
   */
  const windows = [
    order === 'top' ? periodStartIso(period) : null,
    filters.createdAfter,
  ].filter((value): value is string => value !== null)
  const after = windows.length > 0 ? windows.reduce((a, b) => (a > b ? a : b)) : null

  const search = filters.search
  const cursor = typeof query.cursor === 'string' && query.cursor.length > 0 ? query.cursor : ''

  const queries = [
    Query.equal('status', 'published'),
    selected
      ? Query.equal('categoryId', selected.$id)
      // „Alle Topics": alles, was IRGENDEINE Kategorie trägt. Bestandszeilen von
      // vor Migration posts-008 tragen den Default '' und fallen damit heraus.
      : Query.notEqual('categoryId', ''),
    ...(after ? [Query.greaterThanEqual('publishedAt', after)] : []),
    /**
     * `created-before` ist STRIKT kleiner als der Tagesbeginn — „vor dem
     * 15. Januar" schließt den 15. also aus. Das ist die Lesart, die man
     * erwartet, wenn man ein Datum als Grenze eingibt; „bis einschließlich"
     * hieße im Deutschen „bis zum".
     */
    ...(filters.createdBefore ? [Query.lessThan('publishedAt', filters.createdBefore)] : []),
    ...(filters.author ? [Query.equal('authorId', filters.author)] : []),
    ...(filters.pinnedOnly ? [Query.equal('pinned', true)] : []),
    // Zwei getrennte Achsen (offen/geschlossen und gelöst/ungelöst) — genau
    // deshalb sind sie kombinierbar: „offen und noch ungelöst" ist die Frage,
    // die ein Forum wirklich stellt. Begründung in discussionFilters.ts.
    ...(filters.state === 'any' ? [] : [Query.equal('closed', filters.state === 'closed')]),
    ...(filters.solution === 'any' ? [] : [Query.equal('solved', filters.solution === 'solved')]),
    ...(search ? [Query.search('title', search)] : []),
    /**
     * „Neueste" sortiert seit Stufe 2 nach `lastActivityAt`, nicht mehr nach
     * `publishedAt` — sonst rutschte ein Thema mit dreißig frischen Antworten
     * unter ein unbeantwortetes von gestern. Das ist der ganze Sinn des
     * Aktivitäts-Vertrags.
     *
     * Der Zeitraum von „Top" und der Filter `created-after` bleiben bewusst auf
     * `publishedAt`: „Top diese Woche" fragt nach Beiträgen, die DIESE WOCHE
     * ENTSTANDEN sind — ein zwei Jahre altes Thema mit einer Antwort von
     * gestern gehört dort nicht hinein.
     */
    /**
     * ANGEHEFTETES ZUERST — aber nur bei „Neueste" (F1 Stufe 3).
     *
     * Ein Anheften ist eine Aussage über die AKTUELLE Liste („lies das hier
     * zuerst"), keine über den Rang aller Zeiten. Bei „Top" bliebe es deshalb
     * bewusst außen vor: dort würde ein angepinntes Thema mit drei Stimmen über
     * dem meistdiskutierten der Community stehen, und die Rangliste wäre keine
     * mehr.
     *
     * `orderDesc` auf einem Boolean stellt `true` nach vorn (MariaDB: 1 > 0).
     * Der Index dafür ist idx_community_pinned (posts-011) — mit derselben
     * Spaltenfolge, in der hier sortiert wird.
     */
    ...(order === 'top'
      ? [Query.orderDesc('score')]
      : [Query.orderDesc('pinned'), Query.orderDesc('lastActivityAt')]),
    Query.limit(PAGE_SIZE),
    ...(cursor ? [Query.cursorAfter(cursor)] : []),
  ]

  const res = await db.list<CommunityPost>(POSTS_TABLE, queries).catch((error) => {
    throw toH3Error(error, 'Could not load topics')
  })

  // Avatare und Aufruf-Zahlen parallel: zwei gebündelte Abfragen für die ganze
  // Seite, kein N+1. Die Zähler liegen in `post_views` und werden über die
  // Operator-Klinke gelesen (die Zeilen tragen bewusst keine Client-Rechte) —
  // die Id-Liste stammt aus Zeilen, die der Aufrufer schon gesehen hat.
  const [avatars, views] = await Promise.all([
    resolveAvatars(event, res.rows.map(row => row.authorId)),
    topicViewsFor(event, res.rows.map(row => row.$id)),
  ])

  const rows: DiscussionTopic[] = []
  for (const row of res.rows) {
    const category = byId.get(row.categoryId)
    // Zeigt ein Beitrag auf eine Kategorie, die es nicht (mehr) gibt, fällt er
    // still heraus statt die Liste zu sprengen. Passieren kann das nur, wenn
    // jemand eine Kategorie an der Route vorbei löscht — die DELETE-Route
    // verweigert belegte Kategorien.
    if (!category) continue
    rows.push(toDiscussionTopic(row, category, avatars.get(row.authorId), views.get(row.$id) ?? 0))
  }

  return {
    rows,
    // Der Cursor zeigt auf die letzte GELESENE Zeile, nicht auf die letzte
    // ausgelieferte — sonst überspränge die nächste Seite alles, was oben
    // herausgefallen ist.
    nextCursor: res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
