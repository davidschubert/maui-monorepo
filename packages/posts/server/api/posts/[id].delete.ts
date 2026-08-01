import { Permission, Role } from 'node-appwrite'
import { decidePostAuthorAction } from '../../../shared/postAuthorPolicy'
import { POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Soft-Delete durch den Autor: status 'deleted' + Leserecht entziehen —
 * der Post verschwindet aus Feed UND Roh-REST (Row bleibt für Historie/
 * GDPR-Snapshot). Admin-Client für den Permission-Entzug (autoritativ).
 *
 * Wer löschen darf, sagt die eine Autoren-Regel (C16,
 * `shared/postAuthorPolicy.ts`) — der Status spielt dafür bewusst keine
 * Rolle, ein schon gelöschter Beitrag antwortet weiter idempotent.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): der Posting-Feed ist ab Plan personal enthalten.
  requirePlanProduct(event, 'posts')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  // Wartungsmodus friert ALLE Schreibvorgänge ein (s. [id].patch.ts).
  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  // Datentür als Operator (Permission-Entzug ist autoritativ) — get belegt
  // die Zugehörigkeit: ein fremder Mandant bekommt 404, nie die Row.
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<CommunityPost>(POSTS_TABLE, id, 'Post not found')
  const { canDelete } = decidePostAuthorAction(
    { authorId: row.authorId, status: row.status, type: row.type },
    user.$id,
  )
  if (!canDelete) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  if (row.status === 'deleted') {
    return { ok: true }
  }

  await db.update(POSTS_TABLE, id, { status: 'deleted' })
    .catch((error) => { throw toH3Error(error, 'Could not delete post') })
  // Nur der Autor behält Leserecht (eigene Historie); update bleibt für
  // Idempotenz-Wiederholungen, ein "Un-Delete" gibt es bewusst nicht (v1).
  await db.updatePermissions(POSTS_TABLE, id, [
    Permission.read(Role.user(user.$id)),
    Permission.update(Role.user(user.$id)),
    Permission.delete(Role.user(user.$id)),
  ]).catch((error) => { throw toH3Error(error, 'Could not delete post') })

  return { ok: true }
})
