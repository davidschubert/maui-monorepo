import { POSTS_TABLE, type CommunityPost } from '../../../../shared/types/post'

/** Moderation: ausgeblendeten Post wiederherstellen (Status + read(any) zurück). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'posts.moderate')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<CommunityPost>({ databaseId, tableId: POSTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Post not found') })
  if (row.status !== 'hidden') {
    throw createError({ status: 409, statusText: 'Only hidden posts can be restored' })
  }

  await admin.tablesDB.updateRow({
    databaseId,
    tableId: POSTS_TABLE,
    rowId: id,
    data: { status: 'published' },
    permissions: [...new Set([...row.$permissions, POST_READ_ANY])],
  }).catch((error) => { throw toH3Error(error, 'Could not restore post') })

  return { ok: true }
})
