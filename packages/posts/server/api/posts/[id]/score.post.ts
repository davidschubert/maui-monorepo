import { AppwriteException, ID, Permission, Query, Role } from 'node-appwrite'
import { scoreVoteSchema } from '../../../../schemas/post'
import { POSTS_TABLE, POST_VOTES_TABLE, type CommunityPost, type PostVote, type PostVoteResponse, type PostVoteValue } from '../../../../shared/types/post'

/**
 * Up-/Downvote auf einen Post — Toggle-Semantik wie comments:
 *   kein Vote → anlegen · gleicher Value → entfernen · anderer → umdrehen.
 * Vote-Rows schreibt der User selbst (SessionClient, Unique-Index sichert ab);
 * danach Recount + EIN Write der Zähler (Admin) → ein Realtime-Event,
 * serialisiert pro Post gegen Lost Updates.
 */
export default defineEventHandler(async (event): Promise<PostVoteResponse> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const postId = getRouterParam(event, 'id')
  if (!postId) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  const { value } = await readValidatedBody(event, scoreVoteSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)
  const admin = createAdminClient(event)

  // Nur published-Posts sind votbar (UI blockt nur clientseitig)
  const target = await admin.tablesDB.getRow<CommunityPost>({ databaseId, tableId: POSTS_TABLE, rowId: postId }).catch(() => null)
  if (!target) {
    throw createError({ status: 404, statusText: 'Post not found' })
  }
  if (target.status !== 'published') {
    throw createError({ status: 409, statusText: 'Post not votable' })
  }

  const existing = await tablesDB.listRows<PostVote>({
    databaseId,
    tableId: POST_VOTES_TABLE,
    queries: [Query.equal('postId', postId), Query.equal('userId', user.$id), Query.limit(1)],
  })
  const current = existing.rows[0]

  if (current && current.value === value) {
    await tablesDB.deleteRow({ databaseId, tableId: POST_VOTES_TABLE, rowId: current.$id })
  }
  else if (current) {
    await tablesDB.updateRow<PostVote>({ databaseId, tableId: POST_VOTES_TABLE, rowId: current.$id, data: { value } })
  }
  else {
    try {
      await tablesDB.createRow<PostVote>({
        databaseId,
        tableId: POST_VOTES_TABLE,
        rowId: ID.unique(),
        data: { postId, userId: user.$id, value },
        permissions: [
          Permission.read(Role.user(user.$id)),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ],
      })
    }
    catch (error) {
      // Doppelklick-Race: der Unique-Index lässt nur einen durch — Counts +
      // myVote werden unten ohnehin autoritativ neu gelesen
      if (!(error instanceof AppwriteException && error.code === 409)) {
        throw createError({ status: 500, statusText: 'Could not vote' })
      }
    }
  }

  return await serializePerPost(postId, async (): Promise<PostVoteResponse> => {
    const [upvotes, downvotes, mine] = await Promise.all([
      admin.tablesDB.listRows({ databaseId, tableId: POST_VOTES_TABLE, queries: [Query.equal('postId', postId), Query.equal('value', 1), Query.limit(1)] }).then(r => r.total),
      admin.tablesDB.listRows({ databaseId, tableId: POST_VOTES_TABLE, queries: [Query.equal('postId', postId), Query.equal('value', -1), Query.limit(1)] }).then(r => r.total),
      admin.tablesDB.listRows<PostVote>({ databaseId, tableId: POST_VOTES_TABLE, queries: [Query.equal('postId', postId), Query.equal('userId', user.$id), Query.limit(1)] }),
    ])
    const myVote: PostVoteValue | null = mine.rows[0]?.value === -1 ? -1 : mine.rows[0] ? 1 : null

    const post = await admin.tablesDB.updateRow<CommunityPost>({
      databaseId,
      tableId: POSTS_TABLE,
      rowId: postId,
      data: { upvotes, downvotes, score: upvotes - downvotes },
    })

    return { post, myVote }
  })
})
