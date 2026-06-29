import { Query } from 'node-appwrite'
import { SORT_MODES } from '../../../schemas/comment'
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
// Controversial lässt sich nicht als Appwrite-Query ausdrücken → server-seitige
// Sortierung über ein begrenztes Top-Level-Fenster.
const CONTRO_CAP = 200
// Antworten je geladener Thread-Seite (komplette Subtrees). Threads mit mehr
// Antworten sind die absolute Ausnahme.
const REPLY_CAP = 500

/** Controversial: viel Aktivität, ausgeglichener Score (Spec-Formel) */
function controversy(comment: Comment): number {
  return (comment.upvotes + comment.downvotes) / Math.max(Math.abs(comment.score), 1)
}

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

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const isContro = sort === 'controversial'
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
      // Controversial: Fenster holen, dann sortieren+slicen (sonst würde nur EINE
      // nach $createdAt paginierte Seite umsortiert).
      Query.limit(isContro ? CONTRO_CAP : PAGE_SIZE),
      Query.offset(isContro ? 0 : offset),
    ],
  })
  const topLevel = isContro
    ? [...topRes.rows].sort((a, b) => controversy(b) - controversy(a)).slice(offset, offset + PAGE_SIZE)
    : topRes.rows
  const topLevelTotal = isContro ? Math.min(topRes.total, CONTRO_CAP) : topRes.total

  // 2) Komplette Subtrees der geladenen Threads (rootId-Index) — keine Waisen
  let replies: Comment[] = []
  if (topLevel.length > 0) {
    const repRes = await tablesDB.listRows<Comment>({
      databaseId,
      tableId: COMMENTS_TABLE,
      queries: [
        ...baseFilters,
        Query.equal('rootId', topLevel.map(t => t.$id)),
        Query.limit(REPLY_CAP),
      ],
    })
    replies = repRes.rows
  }

  // 3) Gesamtzahl aller nicht-hidden Kommentare für die Überschrift
  const totalRes = await tablesDB.listRows<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    queries: [...baseFilters, Query.limit(1)],
  })
  const total = totalRes.total

  const combined = [...topLevel, ...replies]

  // Avatar-URLs der Autoren aus den Account-prefs anreichern (gebündelt, immer aktuell)
  const avatars = await resolveAuthorAvatars(event, combined.map(row => row.authorId))
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

  return { total, topLevelTotal, rows, myVotes, myReports }
})
