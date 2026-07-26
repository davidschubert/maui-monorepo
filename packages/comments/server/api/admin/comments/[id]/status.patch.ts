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
  await requireSitePermission(event, 'comments.moderate')

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  const { status } = await readValidatedBody(event, moderationSchema.parse)
  // Betreiber-Weg durch die Tür: sie zieht die Mandantengrenze, die der
  // Admin-Client sonst umgeht — und liefert 404 statt 403, damit ein
  // Fehlschlag keine fremde ID bestätigt.
  const ops = tenantDb(event, { as: 'operator' })
  const row = await ops.get<ModeratableCommentRow>('comments', commentId, 'Comment not found')

  // Soft-Delete-Kommentare sind sichtbar, aber NICHT moderierbar (Constraint)
  if (row.status === 'deleted') {
    throw createError({ status: 400, statusText: 'Deleted comments cannot be moderated' })
  }

  // Hide zweiphasig (Status-Event, dann Permission-Entzug); Restore in EINEM
  // Write: Status zurück + read(any) wieder anhängen (Event folgt den neuen
  // Permissions → erreicht Leser wieder).
  const updated = await (status === 'hidden'
    ? hideCommentRow(event, row)
    : ops.update<Models.Row & { status: string }>('comments', commentId, { status }, 'Comment not found')
        .then(updatedRow => row.$permissions.includes(COMMENT_READ_ANY)
          ? updatedRow
          // Restore gibt read(any) zurück — Event folgt den neuen Permissions
          // und erreicht Leser wieder.
          : ops.updatePermissions<Models.Row & { status: string }>(
              'comments', commentId, [...row.$permissions, COMMENT_READ_ANY], 'Comment not found',
            ))
  ).catch((error) => { throw toH3Error(error, 'Could not update comment') })

  // Cascade-Hide: Wiederherstellen kaskadiert bewusst NICHT (nur der Parent;
  // Antworten ggf. einzeln).
  if (status === 'hidden') {
    await hideCommentDescendants(event, row)
  }

  await recordAudit(event, {
    action: status === 'hidden' ? 'comment.hidden' : 'comment.restored',
    targetType: 'comment',
    targetId: updated.$id,
    targetName: row.authorName,
  })

  return { $id: updated.$id, status: updated.status }
})
