import type { Models } from 'node-appwrite'
import { z } from 'zod'

/**
 * Moderation: Kommentar ausblenden/wiederherstellen. Die Zweiphasen-Hide-
 * Logik + Cascade lebt beim Table-Owner (comments-Vertrag
 * commentModeration.ts — auch vom Auto-Hide der Report-Eskalation genutzt);
 * diese Route bleibt das RBAC-Gate + Restore + Audit.
 */

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
  const row = await admin.tablesDB.getRow<ModeratableCommentRow>({
    databaseId,
    tableId: 'comments',
    rowId: commentId,
  }).catch((error) => { throw toH3Error(error, 'Comment not found') })

  // Soft-Delete-Kommentare sind sichtbar, aber NICHT moderierbar (Constraint)
  if (row.status === 'deleted') {
    throw createError({ status: 400, statusText: 'Deleted comments cannot be moderated' })
  }

  // Hide zweiphasig (Status-Event, dann Permission-Entzug); Restore in EINEM
  // Write: Status zurück + read(any) wieder anhängen (Event folgt den neuen
  // Permissions → erreicht Leser wieder).
  const updated = await (status === 'hidden'
    ? hideCommentRow(admin, databaseId, row)
    : admin.tablesDB.updateRow<Models.Row & { status: string }>({
        databaseId,
        tableId: 'comments',
        rowId: commentId,
        data: { status },
        permissions: row.$permissions.includes(COMMENT_READ_ANY) ? undefined : [...row.$permissions, COMMENT_READ_ANY],
      })
  ).catch((error) => { throw toH3Error(error, 'Could not update comment') })

  // Cascade-Hide: Wiederherstellen kaskadiert bewusst NICHT (nur der Parent;
  // Antworten ggf. einzeln).
  if (status === 'hidden') {
    await hideCommentDescendants(admin, databaseId, row)
  }

  await recordAudit(event, {
    action: status === 'hidden' ? 'comment.hidden' : 'comment.restored',
    targetType: 'comment',
    targetId: updated.$id,
    targetName: row.authorName,
  })

  return { $id: updated.$id, status: updated.status }
})
