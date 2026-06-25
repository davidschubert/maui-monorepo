import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminCommentListResponse, ModeratedComment, ModerationFilter } from '../../../../shared/types/admin'

const PAGE_SIZE = 25
const FILTERS: ModerationFilter[] = ['reported', 'hidden', 'all']

type CommentRow = Models.Row & Omit<ModeratedComment, '$id' | '$createdAt'>

export default defineEventHandler(async (event): Promise<AdminCommentListResponse> => {
  requirePermission(event, 'comments.moderate')

  const query = getQuery(event)
  const status = FILTERS.includes(query.status as ModerationFilter)
    ? query.status as ModerationFilter
    : 'reported'
  const page = Math.max(1, Number(query.page ?? 1) || 1)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const result = await admin.tablesDB.listRows<CommentRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'comments',
    queries: [
      ...(status === 'all' ? [] : [Query.equal('status', status)]),
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  })

  return {
    total: result.total,
    comments: result.rows.map(row => ({
      $id: row.$id,
      $createdAt: row.$createdAt,
      content: row.content,
      authorId: row.authorId,
      authorName: row.authorName,
      targetId: row.targetId,
      targetType: row.targetType,
      status: row.status,
    })),
  }
})
