import { AppwriteException, ID, Permission, Query, Role } from 'node-appwrite'
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
 *
 * Vote-Rows schreibt der User selbst (SessionClient, Unique-Index sichert ab).
 * Danach werden upvotes/downvotes/score aus den ECHTEN Vote-Counts (AdminClient,
 * sieht alle Rows) neu berechnet und in EINEM updateRow auf den Kommentar
 * geschrieben:
 *  - genau EIN Realtime-Event statt zwei → kein Zähler-Flackern im UI,
 *  - Zähler immer autoritativ → kein Increment-Drift bei parallelen/Doppel-Votes.
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
  let myVote: VoteValue | null

  if (current && current.value === value) {
    // Toggle: Vote entfernen
    await tablesDB.deleteRow({ databaseId, tableId: VOTES_TABLE, rowId: current.$id })
    myVote = null
  }
  else if (current) {
    // Umdrehen
    await tablesDB.updateRow<CommentVote>({ databaseId, tableId: VOTES_TABLE, rowId: current.$id, data: { value } })
    myVote = value
  }
  else {
    // Neuer Vote. Bei Doppelklick können zwei Requests parallel hier landen — der
    // Unique-Index (commentId,userId) lässt nur einen durch; der 409 des zweiten
    // ist kein Fehler (die Counts unten ergeben so oder so den korrekten Stand).
    let created = true
    try {
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
    }
    catch (error) {
      if (!(error instanceof AppwriteException && error.code === 409)) {
        throw createError({ status: 500, statusText: 'Could not vote' })
      }
      created = false
    }
    if (created) {
      myVote = value
    }
    else {
      // Paralleler Request hat den Vote schon angelegt — tatsächlichen Wert lesen.
      const again = await tablesDB.listRows<CommentVote>({
        databaseId, tableId: VOTES_TABLE,
        queries: [Query.equal('commentId', commentId), Query.equal('userId', user.$id), Query.limit(1)],
      })
      myVote = again.rows[0]?.value === -1 ? -1 : again.rows[0] ? 1 : null
    }
  }

  // Zähler autoritativ aus den echten Votes ableiten (AdminClient sieht alle Rows)
  // und upvotes/downvotes/score in EINEM Write setzen → genau ein Realtime-Event.
  const [upvotes, downvotes] = await Promise.all([
    admin.tablesDB.listRows({ databaseId, tableId: VOTES_TABLE, queries: [Query.equal('commentId', commentId), Query.equal('value', 1), Query.limit(1)] }).then(r => r.total),
    admin.tablesDB.listRows({ databaseId, tableId: VOTES_TABLE, queries: [Query.equal('commentId', commentId), Query.equal('value', -1), Query.limit(1)] }).then(r => r.total),
  ])

  const comment = await admin.tablesDB.updateRow<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    rowId: commentId,
    data: { upvotes, downvotes, score: upvotes - downvotes },
  })

  return { comment, myVote }
})
