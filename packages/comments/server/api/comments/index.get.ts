import { Query } from 'node-appwrite'
import { SORT_MODES } from '../../../schemas/comment'
import { hotness } from '../../../shared/sort'
import {
  COMMENTS_TABLE,
  VOTES_TABLE,
  type Comment,
  type CommentVote,
  type CommentListResponse,
  type SortMode,
  type VoteValue,
} from '../../../shared/types/comment'

const PAGE_SIZE = 25
// Trending/Meistdiskutiert lassen sich nicht als Appwrite-Query ausdrücken →
// server-seitige Sortierung über ein begrenztes Fenster der NEUESTEN Threads.
const WINDOW_CAP = 200
// Antwort-Zählung (Meistdiskutiert): schlanke rootId-Sammlung übers Fenster
const COUNT_PAGE = 500
const COUNT_HARD_CAP = 5_000
// Antworten je geladener Thread-Seite (komplette Subtrees) werden per Cursor
// VOLLSTÄNDIG eingesammelt; die Seitengröße ist nur die Batch-Größe. Die harte
// Obergrenze ist ein Notanker gegen entgleisende Pagination — wird sie erreicht,
// loggen wir den Verlust, statt still zu kappen.
const REPLY_PAGE = 500
const REPLY_HARD_CAP = 10_000

// Gast-Microcache (Idee 3): Seite 1 pro Target+Sort für wenige Sekunden —
// fängt Lastspitzen ab (Embed/Landingpage: bis zu 4 Appwrite-Queries pro
// Request). NUR für Gäste (myVotes/myReports leer → keine User-Daten im
// Cache); Realtime bleibt unberührt (Events mergen client-seitig).
const GUEST_TTL_MS = 10_000
const guestCache = createMicrocache<CommentListResponse>(GUEST_TTL_MS)

/**
 * Kommentare eines Targets — paginiert über TOP-LEVEL-Threads, jeder mit seinem
 * kompletten Subtree (rootId-Index). So sind Antworten nie verwaist (ihr
 * Eltern-Thread ist immer mitgeladen). hidden wird ausgefiltert; deleted bleibt
 * drin (Soft-Delete → "[gelöscht]"-Platzhalter). myVotes/myReports des
 * eingeloggten Users kommen aus gebündelten Queries (kein N+1).
 */
export default defineEventHandler(async (event): Promise<CommentListResponse> => {
  const query = getQuery(event)
  const targetId = String(query.targetId ?? '')
  const targetType = String(query.targetType ?? '')
  if (!targetId || !targetType) {
    throw createError({ status: 400, statusText: 'targetId and targetType are required' })
  }

  const sort = SORT_MODES.includes(query.sort as SortMode) ? query.sort as SortMode : 'new'
  const page = Math.max(1, Number(query.page ?? 1) || 1)

  const isGuest = !event.context.user
  const cacheKey = `${targetType}:${targetId}:${sort}`
  if (isGuest && page === 1) {
    const cached = guestCache.get(cacheKey)
    if (cached) return cached
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Fenster-Sorts: erst die neuesten WINDOW_CAP Threads holen, in-memory
  // ranken, dann slicen (sonst würde nur EINE $createdAt-Seite umsortiert)
  const windowed = sort === 'trending' || sort === 'discussed'
  const offset = (page - 1) * PAGE_SIZE

  const baseFilters = [
    Query.equal('targetId', targetId),
    Query.equal('targetType', targetType),
    Query.notEqual('status', 'hidden'),
  ]

  // Stabiler Sekundär-Sort: ohne Tiebreaker können Zeilen mit gleichem score
  // (viele bei 0) über Seitengrenzen doppeln oder fehlen.
  const order = sort === 'top'
    ? [Query.orderDesc('score'), Query.orderDesc('$createdAt')]
    : [Query.orderDesc('$createdAt')]

  // 1) Top-Level-Threads paginieren (parentId null)
  const topRes = await tablesDB.listRows<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    queries: [
      ...baseFilters,
      Query.isNull('parentId'),
      ...order,
      Query.limit(windowed ? WINDOW_CAP : PAGE_SIZE),
      Query.offset(windowed ? 0 : offset),
    ],
  })

  let ranked = topRes.rows
  if (sort === 'trending') {
    // Zeit-Zerfall (HN-Gravity): frisch + Zuspruch schlägt alt + Bestand
    const now = Date.now()
    ranked = [...topRes.rows].sort((a, b) => hotness(b, now) - hotness(a, now))
  }
  else if (sort === 'discussed') {
    // Meistdiskutiert: Antworten je Thread übers Fenster zählen — schlanke
    // rootId-Sammlung (Query.select), chunked (Query.equal max 100 Werte)
    const counts = new Map<string, number>()
    const rootIds = topRes.rows.map(row => row.$id)
    for (let i = 0; i < rootIds.length; i += 100) {
      const chunk = rootIds.slice(i, i + 100)
      let cursor: string | undefined
      let collected = 0
      while (collected < COUNT_HARD_CAP) {
        const res = await tablesDB.listRows<Comment>({
          databaseId,
          tableId: COMMENTS_TABLE,
          queries: [
            ...baseFilters,
            Query.equal('rootId', chunk),
            Query.select(['$id', 'rootId']),
            Query.limit(COUNT_PAGE),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        })
        for (const row of res.rows) {
          if (row.rootId) counts.set(row.rootId, (counts.get(row.rootId) ?? 0) + 1)
        }
        collected += res.rows.length
        if (res.rows.length < COUNT_PAGE) break
        cursor = res.rows.at(-1)!.$id
      }
    }
    ranked = [...topRes.rows].sort((a, b) =>
      (counts.get(b.$id) ?? 0) - (counts.get(a.$id) ?? 0)
      || Date.parse(b.$createdAt) - Date.parse(a.$createdAt))
  }

  const topLevel = windowed ? ranked.slice(offset, offset + PAGE_SIZE) : topRes.rows
  const topLevelTotal = windowed ? Math.min(topRes.total, WINDOW_CAP) : topRes.total

  // 2) Komplette Subtrees der geladenen Threads (rootId-Index) — keine Waisen.
  // Cursor-Pagination bis zur Erschöpfung statt eines einzelnen 500er-Fensters.
  const replies: Comment[] = []
  if (topLevel.length > 0) {
    const rootIds = topLevel.map(t => t.$id)
    let cursor: string | undefined
    while (replies.length < REPLY_HARD_CAP) {
      const repRes = await tablesDB.listRows<Comment>({
        databaseId,
        tableId: COMMENTS_TABLE,
        queries: [
          ...baseFilters,
          Query.equal('rootId', rootIds),
          Query.limit(REPLY_PAGE),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      })
      replies.push(...repRes.rows)
      if (repRes.rows.length < REPLY_PAGE) break
      cursor = repRes.rows.at(-1)!.$id
    }
    if (replies.length >= REPLY_HARD_CAP) {
      console.warn(`[comments] Antworten an REPLY_HARD_CAP (${REPLY_HARD_CAP}) gekappt — target ${targetType}:${targetId}`)
    }
  }

  // 3) Zwei Zähler: total (nicht-hidden, inkl. deleted-Platzhalter) bleibt der
  // Pagination-Sentinel; activeTotal (nur active) ist die Anzeige-Zahl — ein
  // gelöschter Kommentar zählt nirgends mehr als Kommentar.
  const [totalRes, activeRes] = await Promise.all([
    tablesDB.listRows<Comment>({
      databaseId,
      tableId: COMMENTS_TABLE,
      queries: [...baseFilters, Query.limit(1)],
    }),
    tablesDB.listRows<Comment>({
      databaseId,
      tableId: COMMENTS_TABLE,
      queries: [
        Query.equal('targetId', targetId),
        Query.equal('targetType', targetType),
        Query.equal('status', ['active']),
        Query.limit(1),
      ],
    }),
  ])
  const total = totalRes.total
  const activeTotal = activeRes.total

  // Soft-gelöschte bleiben als Thread-Platzhalter in der Antwort, aber Inhalt/
  // Autor werden SERVER-seitig geblankt — der „[gelöscht]"-Text der UI wäre
  // sonst reine Kosmetik (Original-Content per direktem API-Call weiter lesbar).
  const combined = [...topLevel, ...replies].map(row => row.status === 'deleted'
    ? { ...row, content: '', authorName: '', authorId: '' }
    : row)

  // Avatar-URLs der Autoren aus den Account-prefs anreichern (gebündelt, immer aktuell)
  const avatars = await resolveAvatars(event, combined.filter(row => row.authorId).map(row => row.authorId))
  const rows = combined.map(row => ({ ...row, authorAvatarUrl: avatars.get(row.authorId) }))

  const myVotes: Record<string, VoteValue> = {}
  let myReports: string[] = []
  const user = event.context.user

  if (user && rows.length > 0) {
    const ids = rows.map(row => row.$id)
    // Query.equal ist auf 100 Werte begrenzt → in Batches (Subtrees können groß sein)
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const votes = await tablesDB.listRows<CommentVote>({
        databaseId,
        tableId: VOTES_TABLE,
        queries: [Query.equal('userId', user.$id), Query.equal('commentId', batch), Query.limit(batch.length)],
      })
      for (const vote of votes.rows) {
        myVotes[vote.commentId] = vote.value === 1 ? 1 : -1
      }
    }

    // Eigene offene Meldungen — über den expliziten Moderation-Vertrag (chunked),
    // nicht über direkten Zugriff auf dessen `reports`-Tabelle (Layer-Grenze A14).
    const reported = await myOpenReportTargetIds(event, 'comment', ids, user.$id)
    myReports = [...reported]
  }

  const response = { total, activeTotal, topLevelTotal, rows, myVotes, myReports }
  if (isGuest && page === 1) {
    guestCache.set(cacheKey, response)
  }
  return response
})
