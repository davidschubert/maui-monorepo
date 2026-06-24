import { AppwriteException } from 'node-appwrite'
import { COMMENTS_TABLE, type Comment } from '../../../../shared/types/comment'

/**
 * Meldung umschalten: active → reported (melden) bzw. reported → active
 * (Meldung zurückziehen). hidden/deleted bleiben unverändert. Läuft über den
 * AdminClient — der Melder darf die fremde Row nicht selbst schreiben.
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

  await assertCommentsWritable(event)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  let comment: Comment
  try {
    comment = await tablesDB.getRow<Comment>({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId })
  }
  catch (error) {
    if (error instanceof AppwriteException && error.code === 404) {
      throw createError({ status: 404, statusText: 'Comment not found' })
    }
    throw createError({ status: 500, statusText: 'Could not report comment' })
  }

  // Toggle nur zwischen active ↔ reported; hidden/deleted bleiben unverändert
  if (comment.status !== 'active' && comment.status !== 'reported') {
    return { ok: true, status: comment.status }
  }
  const nextStatus = comment.status === 'reported' ? 'active' : 'reported'

  try {
    await tablesDB.updateRow<Comment>({
      databaseId,
      tableId: COMMENTS_TABLE,
      rowId: commentId,
      data: { status: nextStatus },
    })
  }
  catch {
    throw createError({ status: 500, statusText: 'Could not update report status' })
  }

  return { ok: true, status: nextStatus }
})
