import { Query } from 'node-appwrite'
import { postEditSchema } from '../../../schemas/post'
import { POLL_VOTES_TABLE, POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Titel/Body bearbeiten — nur der Autor, nur published/scheduled. Polls sind
 * nach der ersten FREMDEN Stimme eingefroren (Plan §4): die Frage unter
 * bereits abgegebenen Stimmen zu ändern wäre Manipulations-Fläche.
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

  const input = await readValidatedBody(event, postEditSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  const row = await tablesDB.getRow<CommunityPost>({ databaseId, tableId: POSTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Post not found') })
  if (row.authorId !== user.$id) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  if (row.status !== 'published' && row.status !== 'scheduled') {
    throw createError({ status: 409, statusText: 'Post is not editable' })
  }

  if (row.type === 'poll') {
    const admin = createAdminClient(event)
    const foreign = await admin.tablesDB.listRows({
      databaseId,
      tableId: POLL_VOTES_TABLE,
      queries: [Query.equal('postId', id), Query.notEqual('userId', user.$id), Query.limit(1)],
    })
    if (foreign.total > 0) {
      throw createError({ status: 409, statusText: 'Poll already has votes' })
    }
  }

  const updated = await tablesDB.updateRow<CommunityPost>({
    databaseId,
    tableId: POSTS_TABLE,
    rowId: id,
    data: { title: input.title || null, body: input.body },
  }).catch((error) => { throw toH3Error(error, 'Could not update post') })

  return updated
})
