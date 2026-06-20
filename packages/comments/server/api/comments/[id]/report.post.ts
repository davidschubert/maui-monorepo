import { COMMENTS_TABLE, type Comment } from '../../../../shared/types/comment'

/**
 * Kommentar melden: status → reported (bleibt sichtbar, Moderations-Hook
 * für packages/admin). Läuft über den AdminClient — der Melder darf die
 * fremde Row nicht selbst schreiben.
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

  const comment = await tablesDB.getRow<Comment>({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId })

  // Nur aktive Kommentare sind meldbar — deleted/hidden/reported bleiben unverändert
  if (comment.status !== 'active') {
    return { ok: true, status: comment.status }
  }

  await tablesDB.updateRow<Comment>({
    databaseId,
    tableId: COMMENTS_TABLE,
    rowId: commentId,
    data: { status: 'reported' },
  })

  return { ok: true, status: 'reported' }
})
