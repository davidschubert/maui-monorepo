import { Query, type Models } from 'node-appwrite'
import { z } from 'zod'

// Moderation darf nur ausblenden/wiederherstellen — deleted/reported
// sind keine gültigen Ziele (Soft-Delete gehört dem Autor)
const moderationSchema = z.object({
  status: z.enum(['hidden', 'active']),
})

// Obergrenze für die Subtree-Kaskade (= REPLY_CAP im comments-GET). Threads mit
// mehr Antworten sind die absolute Ausnahme.
const THREAD_CAP = 500

type CommentRow = Models.Row & { status: string, authorName: string, parentId: string | null, rootId: string | null }

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
  const row = await admin.tablesDB.getRow<CommentRow>({
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

  // Cascade-Hide: Wird ein Kommentar ausgeblendet, blenden wir seine (geladenen)
  // Nachfahren mit aus — sonst zählt der globale `total` non-hidden, aber
  // unerreichbare Antworten (Parent weg) mit. Wiederherstellen kaskadiert NICHT
  // (nur der Parent; Antworten ggf. einzeln). Best-effort: ein Teilfehler darf
  // die schon erfolgte Parent-Mutation nicht 500en.
  if (status === 'hidden') {
    const threadRoot = row.rootId ?? commentId
    // Ganzen Thread laden (alle Status → korrekte Baumstruktur), dann Nachfahren
    // von commentId per Fixpunkt-BFS ermitteln.
    const thread = await admin.tablesDB.listRows<CommentRow>({
      databaseId,
      tableId: 'comments',
      queries: [Query.equal('rootId', threadRoot), Query.limit(THREAD_CAP)],
    }).catch(() => ({ rows: [] as CommentRow[] }))

    const subtree = new Set<string>([commentId])
    let grew = true
    while (grew) {
      grew = false
      for (const r of thread.rows) {
        if (r.parentId && subtree.has(r.parentId) && !subtree.has(r.$id)) {
          subtree.add(r.$id)
          grew = true
        }
      }
    }
    // Nur aktive Nachfahren ausblenden — deleted-Tombstones + bereits hidden bleiben.
    const toHide = thread.rows.filter(r => r.$id !== commentId && subtree.has(r.$id) && r.status === 'active')
    await Promise.all(toHide.map(r =>
      admin.tablesDB.updateRow({ databaseId, tableId: 'comments', rowId: r.$id, data: { status: 'hidden' } }).catch(() => {}),
    ))
  }

  await recordAudit(event, {
    action: status === 'hidden' ? 'comment.hidden' : 'comment.restored',
    targetType: 'comment',
    targetId: updated.$id,
    targetName: row.authorName,
  })

  return { $id: updated.$id, status: updated.status }
})
