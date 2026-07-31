import type { Models } from 'node-appwrite'
import { z } from 'zod'

/**
 * Bulk-Moderation (Multi-Select in der Queue): hide/restore/dismiss für bis
 * zu BULK_MAX Kommentare in einem Zug. Nutzt dieselben Verträge wie die
 * Einzel-Aktionen — hideCommentRow/hideCommentDescendants (comments-Owner)
 * und resolveReportsForTarget (moderation). Teilfehler brechen den Batch
 * nicht ab (failed-Liste in der Antwort); EIN Audit-Eintrag pro Batch.
 */

const BULK_MAX = 25

const bulkSchema = z.object({
  action: z.enum(['hide', 'restore', 'dismiss']),
  ids: z.array(z.string().min(1).max(255)).min(1).max(BULK_MAX),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireCommunityPermission(event, 'comments.moderate')
  const { action, ids } = await readValidatedBody(event, bulkSchema.parse)

  const ops = tenantDb(event, { as: 'operator' })

  const done: string[] = []
  const failed: string[] = []

  for (const id of [...new Set(ids)]) {
    try {
      if (action === 'dismiss') {
        // Meldungen erledigen, Kommentar bleibt sichtbar
        await resolveReportsForTarget(event, 'comment', id, 'no_action', user.$id)
        done.push(id)
        continue
      }

      // Die Tür prüft JE ID die Zugehörigkeit — eine Sammel-Aktion ist der
      // bequemste Ort, fremde IDs unterzumischen. Fremdes wirft 404 und landet
      // unten in `failed`, von außen nicht von „gibt es nicht" zu unterscheiden.
      const row = await ops.get<ModeratableCommentRow>('comments', id, 'Comment not found')
      // Soft-Delete-Tombstones sind nicht moderierbar (wie Einzel-Route)
      if (row.status === 'deleted') { failed.push(id); continue }

      if (action === 'hide') {
        if (row.status !== 'hidden') {
          await hideCommentRow(event, row)
          await hideCommentDescendants(event, row)
        }
        // Ausblenden schließt zugleich die offenen Meldungen (Lifecycle,
        // wie der Einzel-Flow in der Queue)
        await resolveReportsForTarget(event, 'comment', id, 'hidden', user.$id)
      }
      else if (row.status !== 'active') {
        // restore: Status zurück + read(any) wieder anhängen (ein Write)
        await ops.update<Models.Row & { status: string }>('comments', id, { status: 'active' }, 'Comment not found')
        if (!row.$permissions.includes(COMMENT_READ_ANY)) {
          await ops.updatePermissions('comments', id, [...row.$permissions, COMMENT_READ_ANY], 'Comment not found')
        }
      }
      done.push(id)
    }
    catch (error) {
      console.error(`[admin] Bulk-${action} für Kommentar ${id} fehlgeschlagen:`, error)
      failed.push(id)
    }
  }

  await recordAudit(event, {
    action: `comment.bulk_${action}`,
    targetType: 'comment',
    targetId: '',
    metadata: { count: done.length, failed: failed.length },
  })

  return { ok: failed.length === 0, done, failed }
})
