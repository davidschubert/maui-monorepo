import { AppwriteException } from 'node-appwrite'
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

  const db = tenantDb(event)

  // Status-Guard (Parität zum Patch): nur AKTIVE Kommentare sind löschbar.
  // Ohne die Sperre könnte der Autor einen vom Moderator ausgeblendeten
  // Kommentar per hidden→deleted wieder sichtbar machen — der Listen-Filter
  // lässt deleted (als „[gelöscht]"-Platzhalter) durch, hidden nicht, und der
  // kaskadiert versteckte Subtree würde wieder erreichbar.
  // `get` der Tür belegt zugleich die Mandanten-Zugehörigkeit.
  const existing = await db.get<Comment>(COMMENTS_TABLE, commentId, 'Comment not found')
  if (existing.status !== 'active') {
    throw createError({ status: 409, statusText: 'Comment not deletable' })
  }

  try {
    return await db.update<Comment>(COMMENTS_TABLE, commentId, { status: 'deleted' }, 'Comment not found')
  }
  catch (error) {
    // Row-Security-401 (nicht der Autor) → 403; echte 5xx nicht als 403 tarnen.
    if (error instanceof AppwriteException && error.code === 401) {
      throw createError({ status: 403, statusText: 'Forbidden' })
    }
    throw toH3Error(error, 'Comment could not be deleted')
  }
})
