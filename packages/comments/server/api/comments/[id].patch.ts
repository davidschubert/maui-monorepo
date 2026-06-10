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

  const { content } = await readValidatedBody(event, commentUpdateSchema.parse)
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  try {
    // Sparse Update — Row-Security wirft 401, wenn nicht der Autor schreibt
    return await tablesDB.updateRow<Comment>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: COMMENTS_TABLE,
      rowId: commentId,
      data: { content },
    })
  }
  catch {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})
