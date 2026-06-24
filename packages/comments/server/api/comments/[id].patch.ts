import { commentUpdateSchema } from '../../../schemas/comment'
import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'

/** Eigenen Kommentar bearbeiten — Row-Permission erlaubt nur den Autor. */
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

  const { content } = await readValidatedBody(event, commentUpdateSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  // Status prüfen: nur aktive/gemeldete Kommentare sind editierbar. Ohne diese
  // Sperre könnte der Autor per direktem Call den Inhalt eines ausgeblendeten
  // (hidden) oder soft-gelöschten (deleted) Kommentars überschreiben — die UI
  // versteckt „Bearbeiten" dort nur clientseitig.
  const existing = await tablesDB.getRow<Comment>({ databaseId, tableId: COMMENTS_TABLE, rowId: commentId }).catch(() => null)
  if (!existing) {
    throw createError({ status: 404, statusText: 'Comment not found' })
  }
  if (existing.status !== 'active' && existing.status !== 'reported') {
    throw createError({ status: 409, statusText: 'Comment not editable' })
  }

  try {
    // Sparse Update — Row-Security wirft 401, wenn nicht der Autor schreibt
    return await tablesDB.updateRow<Comment>({
      databaseId,
      tableId: COMMENTS_TABLE,
      rowId: commentId,
      data: { content },
    })
  }
  catch {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})
