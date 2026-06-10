import { Query } from 'node-appwrite'
import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'

const PAGE_SIZE = 25

/** Kommentare eines Posts, neueste zuerst — nur status=visible (Moderations-Hook) */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const postId = String(query.postId ?? '')
  if (!postId) {
    throw createError({ status: 400, statusText: 'postId is required' })
  }

  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  return await tablesDB.listRows<Comment>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMENTS_TABLE,
    queries: [
      Query.equal('postId', postId),
      Query.equal('status', 'visible'),
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  })
})
