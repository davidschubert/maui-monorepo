import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminCommentListResponse, ModeratedComment, ModerationFilter } from '../../../../shared/types/moderation'

const PAGE_SIZE = 25
const FILTERS: ModerationFilter[] = ['reported', 'hidden', 'all']

type CommentRow = Models.Row & Omit<ModeratedComment, '$id' | '$createdAt' | 'reportCount'>

function toModerated(row: CommentRow): ModeratedComment {
  return {
    $id: row.$id,
    $createdAt: row.$createdAt,
    content: row.content,
    authorId: row.authorId,
    authorName: row.authorName,
    targetId: row.targetId,
    targetType: row.targetType,
    status: row.status,
  }
}

export default defineEventHandler(async (event): Promise<AdminCommentListResponse> => {
  await requireSitePermission(event, 'comments.moderate')

  const query = getQuery(event)
  const status = FILTERS.includes(query.status as ModerationFilter)
    ? query.status as ModerationFilter
    : 'reported'
  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const offset = (page - 1) * PAGE_SIZE

  // Betreiber-Weg durch die Tür — der Filter kommt von dort, nicht aus dieser
  // Route. Vorher stand hier scopeQuery von Hand; genau solche Stellen wollen
  // wir nicht mehr pflegen müssen.
  const ops = tenantDb(event, { as: 'operator' })
  // KI-Assist-Verfügbarkeit einmal pro Liste — das UI blendet den Button
  // sonst gar nicht erst ein (core-Gate maui.ai + NUXT_AI_KEY)
  const aiAssist = isAiAvailable(event)

  // 'reported' kommt jetzt aus dem Moderation-Layer (reports-Tabelle), nicht mehr
  // aus comment.status — über den expliziten Vertrag, nicht direkt (Layer-Grenze A14).
  if (status === 'reported') {
    const { order, counts } = await openReportsByTarget(event, 'comment')
    const pageIds = order.slice(offset, offset + PAGE_SIZE)
    if (pageIds.length === 0) {
      return { total: order.length, comments: [], aiAssist }
    }
    const result = await ops.list<CommentRow>('comments', [
      Query.equal('$id', pageIds),
      Query.limit(pageIds.length),
    ])
    const byId = new Map(result.rows.map(row => [row.$id, row]))
    const comments = pageIds
      .map(id => byId.get(id))
      .filter((row): row is CommentRow => row !== undefined)
      .map(row => ({ ...toModerated(row), reportCount: counts.get(row.$id) ?? 0 }))
    return { total: order.length, comments, aiAssist }
  }

  const result = await ops.list<CommentRow>('comments', [
    ...(status === 'all' ? [] : [Query.equal('status', status)]),
    Query.orderDesc('$createdAt'),
    Query.limit(PAGE_SIZE),
    Query.offset(offset),
  ])

  return {
    total: result.total,
    comments: result.rows.map(toModerated),
    aiAssist,
  }
})
