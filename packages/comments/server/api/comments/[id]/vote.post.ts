import { ID, Permission, Query, Role } from 'node-appwrite'
import { voteSchema } from '../../../../schemas/comment'
import { VOTES_TABLE, type CommentVote } from '../../../../shared/types/comment'

/**
 * Vote-Upsert: ein Vote pro User und Kommentar (Unique-Index sichert das
 * zusätzlich auf DB-Ebene ab). UI-Feinschliff kommt in Phase 11.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  const { value } = await readValidatedBody(event, voteSchema.parse)
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const existing = await tablesDB.listRows<CommentVote>({
    databaseId,
    tableId: VOTES_TABLE,
    queries: [
      Query.equal('commentId', commentId),
      Query.equal('userId', user.$id),
      Query.limit(1),
    ],
  })

  const current = existing.rows[0]

  if (current) {
    // Sparse Update (1.9): nur das geänderte Attribut geht über die Leitung
    return await tablesDB.updateRow<CommentVote>({
      databaseId,
      tableId: VOTES_TABLE,
      rowId: current.$id,
      data: { value },
    })
  }

  const row = await tablesDB.createRow<CommentVote>({
    databaseId,
    tableId: VOTES_TABLE,
    rowId: ID.unique(),
    data: { commentId, userId: user.$id, value },
    permissions: [
      Permission.read(Role.user(user.$id)),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  })

  setResponseStatus(event, 201)
  return row
})
