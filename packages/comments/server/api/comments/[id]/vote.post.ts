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

  // Status prüfen: auf gelöschte/ausgeblendete Kommentare darf nicht gevotet
  // werden (UI blockt nur clientseitig). Sonst ließen sich Vote-Rows + Score
  // eines [gelöscht]-Platzhalters per direktem Request manipulieren.
  const target = await admin.tablesDB.getRow<Comment>({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId }).catch(() => null)
  if (!target) {
    throw createError({ status: 404, statusText: 'Comment not found' })
  }
  if (target.status !== 'active' && target.status !== 'reported') {
    throw createError({ status: 409, statusText: 'Comment not votable' })
  }

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

  if (current && current.value === value) {
    // Toggle: Vote entfernen
    await tablesDB.deleteRow({ databaseId, tableId: VOTES_TABLE, rowId: current.$id })
  }
  else if (current) {
    // Umdrehen
    await tablesDB.updateRow<CommentVote>({ databaseId, tableId: VOTES_TABLE, rowId: current.$id, data: { value } })
  }
  else {
    // Neuer Vote. Bei Doppelklick können zwei Requests parallel hier landen — der
    // Unique-Index (commentId,userId) lässt nur einen durch; der 409 des zweiten
    // ist kein Fehler (Counts + myVote werden unten autoritativ neu gelesen).
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
    }
  }

  // Zähler UND eigenen Vote autoritativ aus den echten Votes ableiten (AdminClient
  // sieht alle Rows) und upvotes/downvotes/score in EINEM Write setzen → genau ein
  // Realtime-Event. myVote aus der DB statt aus dem Write-Pfad: bei Doppelklick
  // (Toggle/Flip parallel) gewinnt sonst eine Race und myVote weicht vom Count ab.
  const [upvotes, downvotes, mine] = await Promise.all([
    admin.tablesDB.listRows({ databaseId, tableId: VOTES_TABLE, queries: [Query.equal('commentId', commentId), Query.equal('value', 1), Query.limit(1)] }).then(r => r.total),
    admin.tablesDB.listRows({ databaseId, tableId: VOTES_TABLE, queries: [Query.equal('commentId', commentId), Query.equal('value', -1), Query.limit(1)] }).then(r => r.total),
    admin.tablesDB.listRows<CommentVote>({ databaseId, tableId: VOTES_TABLE, queries: [Query.equal('commentId', commentId), Query.equal('userId', user.$id), Query.limit(1)] }),
  ])
  const myVote: VoteValue | null = mine.rows[0]?.value === -1 ? -1 : mine.rows[0] ? 1 : null

  const comment = await admin.tablesDB.updateRow<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    rowId: commentId,
    data: { upvotes, downvotes, score: upvotes - downvotes },
  })

  return { comment, myVote }
})
