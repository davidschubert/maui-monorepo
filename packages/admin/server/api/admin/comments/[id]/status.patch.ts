import { z } from 'zod'
import type { Models } from 'node-appwrite'

// Moderation darf nur ausblenden/wiederherstellen — deleted/reported
// sind keine gültigen Ziele (Soft-Delete gehört dem Autor)
const moderationSchema = z.object({
  status: z.enum(['hidden', 'active']),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'comments.moderate')

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  const { status } = await readValidatedBody(event, moderationSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  // Fehlender Kommentar → 404 (nicht 500). toH3Error mappt Appwrite-4xx korrekt.
  const row = await admin.tablesDB.getRow<Models.Row & { status: string, authorName: string }>({
    databaseId,
    tableId: 'comments',
    rowId: commentId,
  }).catch((error) => { throw toH3Error(error, 'Comment not found') })

  // Soft-Delete-Kommentare sind sichtbar, aber NICHT moderierbar (Constraint)
  if (row.status === 'deleted') {
    throw createError({ status: 400, statusText: 'Deleted comments cannot be moderated' })
  }

  const updated = await admin.tablesDB.updateRow<Models.Row & { status: string }>({
    databaseId,
    tableId: 'comments',
    rowId: commentId,
    data: { status },
  }).catch((error) => { throw toH3Error(error, 'Could not update comment') })

  await recordAudit(event, {
    action: status === 'hidden' ? 'comment.hidden' : 'comment.restored',
    targetType: 'comment',
    targetId: updated.$id,
    targetName: row.authorName,
  })

  return { $id: updated.$id, status: updated.status }
})
