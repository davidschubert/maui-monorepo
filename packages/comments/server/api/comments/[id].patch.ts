import { AppwriteException } from 'node-appwrite'
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
  if (existing.status !== 'active') {
    throw createError({ status: 409, statusText: 'Comment not editable' })
  }

  try {
    // Sparse Update — Row-Security wirft 401, wenn nicht der Autor schreibt.
    // editedAt markiert die echte Bearbeitung (≠ $updatedAt, das auch Votes bumpen).
    return await tablesDB.updateRow<Comment>({
      databaseId,
      tableId: COMMENTS_TABLE,
      rowId: commentId,
      data: { content, editedAt: new Date().toISOString() },
    })
  }
  catch (error) {
    // Row-Security-401 (nicht der Autor) → 403; echte 5xx nicht als 403 tarnen.
    if (error instanceof AppwriteException && error.code === 401) {
      throw createError({ status: 403, statusText: 'Forbidden' })
    }
    throw toH3Error(error, 'Comment could not be updated')
  }
})
