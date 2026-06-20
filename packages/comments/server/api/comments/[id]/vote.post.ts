import { ID, Permission, Query, Role } from 'node-appwrite'
import { voteSchema } from '../../../../schemas/comment'
import {
  COMMENTS_TABLE,
  VOTES_TABLE,
  type Comment,
  type CommentVote,
  type VoteResponse,
  type VoteValue,
} from '../../../../shared/types/comment'

/**
 * Vote mit Toggle-Semantik (Spec):
 *   kein Vote      → anlegen
 *   gleicher Value → Vote ENTFERNEN (Toggle)
 *   anderer Value  → umdrehen
 * Vote-Rows schreibt der User selbst (SessionClient, Unique-Index sichert ab);
 * die denormalisierten Zähler auf dem Kommentar pflegt der AdminClient
 * server-autoritativ via atomarer Increments (Voter darf fremde Rows nicht schreiben).
 */
export default defineEventHandler(async (event): Promise<VoteResponse> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  await assertCommentsWritable(event)

  const { value } = await readValidatedBody(event, voteSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)
  const admin = createAdminClient(event)

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
  const column = (v: VoteValue) => v === 1 ? 'upvotes' : 'downvotes'
  let myVote: VoteValue | null

  if (current && current.value === value) {
    // Toggle: Vote entfernen
    await tablesDB.deleteRow({ databaseId, tableId: VOTES_TABLE, rowId: current.$id })
    await admin.tablesDB.decrementRowColumn({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId, column: column(value), value: 1 })
    myVote = null
  }
  else if (current) {
    // Umdrehen: alten Zähler runter, neuen hoch
    await tablesDB.updateRow<CommentVote>({ databaseId, tableId: VOTES_TABLE, rowId: current.$id, data: { value } })
    await admin.tablesDB.decrementRowColumn({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId, column: column(value === 1 ? -1 : 1), value: 1 })
    await admin.tablesDB.incrementRowColumn({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId, column: column(value), value: 1 })
    myVote = value
  }
  else {
    await tablesDB.createRow<CommentVote>({
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
    await admin.tablesDB.incrementRowColumn({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId, column: column(value), value: 1 })
    myVote = value
  }

  // score = upvotes - downvotes, einmal konsistent nachziehen
  const fresh = await admin.tablesDB.getRow<Comment>({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId })
  const comment = await admin.tablesDB.updateRow<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    rowId: commentId,
    data: { score: fresh.upvotes - fresh.downvotes },
  })

  return { comment, myVote }
})
