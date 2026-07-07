import { ID, Permission, Query, Role } from 'node-appwrite'
import { voteSchema } from '../../../../schemas/post'
import { POLL_VOTES_TABLE, POSTS_TABLE, type CommunityPost, type PollVote } from '../../../../shared/types/post'

/**
 * Poll-Stimme: setzen, wechseln oder (gleiche Option erneut) zurückziehen —
 * server-autoritativ über den Admin-Client (poll_votes haben bewusst keine
 * User-Schreibrechte). Gesperrt nach pollEndsAt. Antwort = frischer
 * Poll-Zustand (Ergebnisse sichtbar, solange die eigene Stimme steht).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  const { optionIndex } = await readValidatedBody(event, voteSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const post = await admin.tablesDB.getRow<CommunityPost>({ databaseId, tableId: POSTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Post not found') })
  if (post.type !== 'poll' || post.status !== 'published') {
    throw createError({ status: 409, statusText: 'Not an open poll' })
  }
  if (post.pollEndsAt && Date.parse(post.pollEndsAt) <= Date.now()) {
    throw createError({ status: 409, statusText: 'Poll has ended' })
  }
  const options = parsePollOptions(post)
  if (optionIndex >= options.length) {
    throw createError({ status: 422, statusText: 'Unknown option' })
  }

  const existing = await admin.tablesDB.listRows<PollVote>({
    databaseId,
    tableId: POLL_VOTES_TABLE,
    queries: [Query.equal('postId', id), Query.equal('userId', user.$id), Query.limit(1)],
  })
  const current = existing.rows[0]

  if (current && current.optionIndex === optionIndex) {
    // Toggle: gleiche Option erneut = Stimme zurückziehen
    await admin.tablesDB.deleteRow({ databaseId, tableId: POLL_VOTES_TABLE, rowId: current.$id })
  }
  else if (current) {
    await admin.tablesDB.updateRow({
      databaseId, tableId: POLL_VOTES_TABLE, rowId: current.$id, data: { optionIndex },
    })
  }
  else {
    await admin.tablesDB.createRow({
      databaseId,
      tableId: POLL_VOTES_TABLE,
      rowId: ID.unique(),
      data: { postId: id, userId: user.$id, optionIndex },
      // eigene Stimme lesbar (Debug/Export) — mehr nicht
      permissions: [Permission.read(Role.user(user.$id))],
    }).catch(async (error) => {
      // Unique-Index-Race (Doppelklick/zwei Tabs): der Gewinner steht — dessen
      // Row auf die gewünschte Option ziehen statt 409 zu leaken
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
        const winner = await admin.tablesDB.listRows<PollVote>({
          databaseId, tableId: POLL_VOTES_TABLE,
          queries: [Query.equal('postId', id), Query.equal('userId', user.$id), Query.limit(1)],
        })
        if (winner.rows[0] && winner.rows[0].optionIndex !== optionIndex) {
          await admin.tablesDB.updateRow({
            databaseId, tableId: POLL_VOTES_TABLE, rowId: winner.rows[0].$id, data: { optionIndex },
          })
        }
        return
      }
      throw toH3Error(error, 'Could not vote')
    })
  }

  // Frischen Zustand zurückgeben — die UI ersetzt ihren Poll-State atomar
  const states = await pollStatesFor(event, [post], user.$id)
  return { poll: states.get(post.$id) }
})
