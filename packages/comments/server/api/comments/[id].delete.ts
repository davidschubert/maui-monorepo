import { COMMENTS_TABLE, type Comment } from '../../../shared/types/comment'

/**
 * Soft-Delete (Spec): status → deleted, Row bleibt erhalten — Antworten
 * darunter bleiben erreichbar, die UI zeigt einen "[gelöscht]"-Platzhalter.
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

  // Löschen bleibt bei deaktivierten Kommentaren erlaubt — nur Wartung friert es ein
  await assertNotMaintenance(event)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  try {
    return await tablesDB.updateRow<Comment>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: COMMENTS_TABLE,
      rowId: commentId,
      data: { status: 'deleted' },
    })
  }
  catch {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})
