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
// Sortierung über ein begrenztes Fenster (Threads > CONTRO_CAP sind die Ausnahme).
const CONTRO_CAP = 200

/** Controversial: viel Aktivität, ausgeglichener Score (Spec-Formel) */
function controversy(comment: Comment): number {
  return (comment.upvotes + comment.downvotes) / Math.max(Math.abs(comment.score), 1)
}

/**
 * Kommentare eines Targets. hidden wird ausgefiltert; deleted bleibt drin
 * (Soft-Delete → "[gelöscht]"-Platzhalter, Antworten bleiben erreichbar).
 * myVotes des eingeloggten Users kommen aus EINEM votes-Query (kein N+1).
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

  // Stabiler Sekundär-Sort: ohne Tiebreaker können Zeilen mit gleichem score
  // (viele bei 0) über Seitengrenzen doppeln oder fehlen.
  const order = sort === 'top'
    ? [Query.orderDesc('score'), Query.orderDesc('$createdAt')]
    : [Query.orderDesc('$createdAt')]

  const result = await tablesDB.listRows<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    queries: [
      Query.equal('targetId', targetId),
      Query.equal('targetType', targetType),
      Query.notEqual('status', 'hidden'),
      ...order,
      // Controversial: ganzes Fenster holen, dann sortieren+slicen — sonst würde
      // nur EINE nach $createdAt paginierte Seite umsortiert ("neueste 25").
      Query.limit(isContro ? CONTRO_CAP : PAGE_SIZE),
      Query.offset(isContro ? 0 : offset),
    ],
  })

  const sorted = isContro
    ? [...result.rows].sort((a, b) => controversy(b) - controversy(a)).slice(offset, offset + PAGE_SIZE)
    : result.rows
  // Bei controversial nur das sortierbare Fenster paginieren (ehrliche total)
  const total = isContro ? Math.min(result.total, CONTRO_CAP) : result.total

  // Avatar-URLs der Autoren aus den Account-prefs anreichern (ein Query, immer aktuell)
  const avatars = await resolveAuthorAvatars(event, sorted.map(row => row.authorId))
  const rows = sorted.map(row => ({ ...row, authorAvatarUrl: avatars.get(row.authorId) }))

  const myVotes: Record<string, VoteValue> = {}
  let myReports: string[] = []
  const user = event.context.user

  if (user && rows.length > 0) {
    const votes = await tablesDB.listRows<CommentVote>({
      databaseId,
      tableId: VOTES_TABLE,
      queries: [
        Query.equal('userId', user.$id),
        Query.equal('commentId', rows.map(row => row.$id)),
        Query.limit(rows.length),
      ],
    })
    for (const vote of votes.rows) {
      myVotes[vote.commentId] = vote.value === 1 ? 1 : -1
    }

    // Eigene offene Meldungen — über den expliziten Moderation-Vertrag, nicht
    // über direkten Zugriff auf dessen `reports`-Tabelle (Layer-Grenze A14).
    const reported = await myOpenReportTargetIds(event, 'comment', rows.map(row => row.$id), user.$id)
    myReports = [...reported]
  }

  return { total, rows, myVotes, myReports }
})
