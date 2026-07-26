import { POSTS_TABLE, type CommunityPost } from '../../../../shared/types/post'

/** Moderation: ausgeblendeten Post wiederherstellen (Status + read(any) zurück). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'posts.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  // Datentür als Operator — get belegt die Zugehörigkeit (fremd → 404).
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<CommunityPost>(POSTS_TABLE, id, 'Post not found')
  if (row.status !== 'hidden') {
    throw createError({ status: 409, statusText: 'Only hidden posts can be restored' })
  }

  // Erst das Leserecht zurück, dann der Status — so ist die Row beim
  // Status-Realtime-Event bereits wieder lesbar.
  await db.updatePermissions(POSTS_TABLE, id, [...new Set([...row.$permissions, POST_READ_ANY])])
    .catch((error) => { throw toH3Error(error, 'Could not restore post') })
  await db.update(POSTS_TABLE, id, { status: 'published' })
    .catch((error) => { throw toH3Error(error, 'Could not restore post') })

  return { ok: true }
})
