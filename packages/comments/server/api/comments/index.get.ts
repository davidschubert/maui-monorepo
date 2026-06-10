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

  const order = sort === 'top'
    ? Query.orderDesc('score')
    : Query.orderDesc('$createdAt')

  const result = await tablesDB.listRows<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    queries: [
      Query.equal('targetId', targetId),
      Query.equal('targetType', targetType),
      Query.notEqual('status', 'hidden'),
      order,
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  })

  // Controversial lässt sich nicht als Appwrite-Query ausdrücken —
  // wird je Seite server-seitig berechnet (bewusste Limitierung)
  const rows = sort === 'controversial'
    ? [...result.rows].sort((a, b) => controversy(b) - controversy(a))
    : result.rows

  const myVotes: Record<string, VoteValue> = {}
  const user = event.context.user

  if (user && rows.length > 0) {
    const votes = await tablesDB.listRows<CommentVote>({
      databaseId,
      tableId: VOTES_TABLE,
      queries: [
        Query.equal('userId', user.$id),
        Query.equal('commentId', rows.map(row => row.$id)),
        Query.limit(PAGE_SIZE),
      ],
    })
    for (const vote of votes.rows) {
      myVotes[vote.commentId] = vote.value === 1 ? 1 : -1
    }
  }

  return { total: result.total, rows, myVotes }
})
