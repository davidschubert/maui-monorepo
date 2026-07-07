import { Permission, Role } from 'node-appwrite'
import { POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Soft-Delete durch den Autor: status 'deleted' + Leserecht entziehen —
 * der Post verschwindet aus Feed UND Roh-REST (Row bleibt für Historie/
 * GDPR-Snapshot). Admin-Client für den Permission-Entzug (autoritativ).
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

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<CommunityPost>({ databaseId, tableId: POSTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Post not found') })
  if (row.authorId !== user.$id) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
  if (row.status === 'deleted') {
    return { ok: true }
  }

  await admin.tablesDB.updateRow({
    databaseId,
    tableId: POSTS_TABLE,
    rowId: id,
    data: { status: 'deleted' },
    // Nur der Autor behält Leserecht (eigene Historie); update bleibt für
    // Idempotenz-Wiederholungen, ein "Un-Delete" gibt es bewusst nicht (v1).
    permissions: [
      Permission.read(Role.user(user.$id)),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not delete post') })

  return { ok: true }
})
