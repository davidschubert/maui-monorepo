import { Permission, Query, Role, type Models } from 'node-appwrite'
import { z } from 'zod'

// Row-Level-Sichtbarkeit (Migration comments-008): nicht-hidden Rows tragen
// read("any"); Ausblenden ENTZIEHT die Permission (Roh-REST-Leak zu),
// Wiederherstellen gibt sie zurück.
const READ_ANY = Permission.read(Role.any())

/** Hide: Status-Update (Event erreicht Leser noch) → dann Permission entziehen. */
async function hideRow(admin: ReturnType<typeof createAdminClient>, databaseId: string, row: Models.Row) {
  const updated = await admin.tablesDB.updateRow<Models.Row & { status: string }>({
    databaseId, tableId: 'comments', rowId: row.$id, data: { status: 'hidden' },
  })
  // Zweite Phase getrennt: würde die Permission im selben Write fallen, käme
  // das hidden-Event bei Gästen/Lesern nie an (Auslieferung folgt den Row-
  // Permissions) und der Kommentar bliebe bis zum Reload stehen.
  if (updated.$permissions.includes(READ_ANY)) {
    await admin.tablesDB.updateRow({
      databaseId, tableId: 'comments', rowId: row.$id,
      permissions: updated.$permissions.filter(p => p !== READ_ANY),
    }).catch(() => {}) // best effort — Status ist bereits hidden (Filter greift)
  }
  return updated
}

// Moderation darf nur ausblenden/wiederherstellen — deleted/reported
// sind keine gültigen Ziele (Soft-Delete gehört dem Autor)
const moderationSchema = z.object({
  status: z.enum(['hidden', 'active']),
})

// Thread wird per Cursor VOLLSTÄNDIG geladen (Batch-Größe THREAD_PAGE); die
// harte Grenze ist nur ein Notanker gegen entgleisende Pagination (mit Log).
const THREAD_PAGE = 500
const THREAD_HARD_CAP = 10_000

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

  // Hide zweiphasig (Status-Event, dann Permission-Entzug); Restore in EINEM
  // Write: Status zurück + read(any) wieder anhängen (Event folgt den neuen
  // Permissions → erreicht Leser wieder).
  const updated = await (status === 'hidden'
    ? hideRow(admin, databaseId, row)
    : admin.tablesDB.updateRow<Models.Row & { status: string }>({
        databaseId,
        tableId: 'comments',
        rowId: commentId,
        data: { status },
        permissions: row.$permissions.includes(READ_ANY) ? undefined : [...row.$permissions, READ_ANY],
      })
  ).catch((error) => { throw toH3Error(error, 'Could not update comment') })

  // Cascade-Hide: Wird ein Kommentar ausgeblendet, blenden wir seine (geladenen)
  // Nachfahren mit aus — sonst zählt der globale `total` non-hidden, aber
  // unerreichbare Antworten (Parent weg) mit. Wiederherstellen kaskadiert NICHT
  // (nur der Parent; Antworten ggf. einzeln). Best-effort: ein Teilfehler darf
  // die schon erfolgte Parent-Mutation nicht 500en.
  if (status === 'hidden') {
    const threadRoot = row.rootId ?? commentId
    // Ganzen Thread laden (alle Status → korrekte Baumstruktur), dann Nachfahren
    // von commentId per Fixpunkt-BFS ermitteln. Cursor-Pagination bis zur
    // Erschöpfung — ein hartes 500er-Fenster ließe Nachfahren jenseits davon
    // sichtbar-aber-verwaist zurück.
    const threadRows: CommentRow[] = []
    try {
      let cursor: string | undefined
      while (threadRows.length < THREAD_HARD_CAP) {
        const pageRes = await admin.tablesDB.listRows<CommentRow>({
          databaseId,
          tableId: 'comments',
          queries: [
            Query.equal('rootId', threadRoot),
            Query.limit(THREAD_PAGE),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
          ],
        })
        threadRows.push(...pageRes.rows)
        if (pageRes.rows.length < THREAD_PAGE) break
        cursor = pageRes.rows.at(-1)!.$id
      }
      if (threadRows.length >= THREAD_HARD_CAP) {
        console.warn(`[moderation] Cascade-Hide an THREAD_HARD_CAP (${THREAD_HARD_CAP}) gekappt — root ${threadRoot}`)
      }
    }
    catch { /* best effort — Parent ist bereits ausgeblendet */ }

    const subtree = new Set<string>([commentId])
    let grew = true
    while (grew) {
      grew = false
      for (const r of threadRows) {
        if (r.parentId && subtree.has(r.parentId) && !subtree.has(r.$id)) {
          subtree.add(r.$id)
          grew = true
        }
      }
    }
    // Nur aktive Nachfahren ausblenden — deleted-Tombstones + bereits hidden bleiben.
    const toHide = threadRows.filter(r => r.$id !== commentId && subtree.has(r.$id) && r.status === 'active')
    await Promise.all(toHide.map(r => hideRow(admin, databaseId, r).catch(() => {})))
  }

  await recordAudit(event, {
    action: status === 'hidden' ? 'comment.hidden' : 'comment.restored',
    targetType: 'comment',
    targetId: updated.$id,
    targetName: row.authorName,
  })

  return { $id: updated.$id, status: updated.status }
})
