import { Permission, Query, Role, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'
import { COMMENTS_TABLE } from '../../shared/types/comment'

/**
 * Server-Vertrag des comments-Layers fürs Ausblenden (Moderation): die
 * Zweiphasen-Hide-Logik + Cascade gehört dem Table-Owner — Konsumenten sind
 * die admin-Moderations-Route (status.patch) und der Auto-Hide-Handler
 * (Report-Eskalation). Vorher lebte der Code in admin/status.patch.
 *
 * Row-Level-Sichtbarkeit (Migration comments-008): nicht-hidden Rows tragen
 * read("any"); Ausblenden ENTZIEHT die Permission (Roh-REST-Leak zu),
 * Wiederherstellen gibt sie zurück.
 */
export const COMMENT_READ_ANY = Permission.read(Role.any())

// Thread wird per Cursor VOLLSTÄNDIG geladen (Batch-Größe THREAD_PAGE); die
// harte Grenze ist nur ein Notanker gegen entgleisende Pagination (mit Log).
const THREAD_PAGE = 500
const THREAD_HARD_CAP = 10_000

export type ModeratableCommentRow = Models.Row & {
  status: string
  authorName: string
  parentId: string | null
  rootId: string | null
}

/**
 * Hide: Status-Update (Event erreicht Leser noch) → dann Permission entziehen.
 * Mit `event` werden zusätzlich die Activity-Feed-Einträge des Kommentars
 * entfernt (removeActivitiesForObject, core) — sonst bleibt sein
 * metadata-Snippet im Feed sichtbar, obwohl der Inhalt wegmoderiert ist.
 */
export async function hideCommentRow(
  admin: ReturnType<typeof createAdminClient>,
  databaseId: string,
  row: Models.Row,
  event?: H3Event,
): Promise<Models.Row & { status: string }> {
  const updated = await admin.tablesDB.updateRow<Models.Row & { status: string }>({
    databaseId, tableId: COMMENTS_TABLE, rowId: row.$id, data: { status: 'hidden' },
  })
  // Zweite Phase getrennt: würde die Permission im selben Write fallen, käme
  // das hidden-Event bei Gästen/Lesern nie an (Auslieferung folgt den Row-
  // Permissions) und der Kommentar bliebe bis zum Reload stehen.
  if (updated.$permissions.includes(COMMENT_READ_ANY)) {
    const withdraw = () => admin.tablesDB.updateRow({
      databaseId, tableId: COMMENTS_TABLE, rowId: row.$id,
      permissions: updated.$permissions.filter(p => p !== COMMENT_READ_ANY),
    })
    // Phase 2 muss halten — sonst bleibt der hidden-Kommentar per Roh-REST
    // gast-lesbar. Ein Retry deckt transiente Fehler; ein persistenter wird
    // laut geloggt statt geschluckt (Re-Hide über die UI ist idempotent und
    // zieht die Phase nach).
    await withdraw()
      .catch(() => withdraw())
      .catch((error) => {
        console.error(`[moderation] Permission-Entzug fehlgeschlagen — hidden-Kommentar ${row.$id} bleibt Roh-REST-lesbar bis zum Re-Hide:`, error)
      })
  }
  if (event) {
    await removeActivitiesForObject(event, { objectType: 'comment', objectId: row.$id })
  }
  return updated
}

/**
 * Cascade-Hide: blendet die (geladenen) Nachfahren eines bereits versteckten
 * Kommentars mit aus — sonst zählt der globale `total` non-hidden, aber
 * unerreichbare Antworten (Parent weg) mit. Best-effort: ein Teilfehler darf
 * die schon erfolgte Parent-Mutation nicht 500en.
 */
export async function hideCommentDescendants(
  admin: ReturnType<typeof createAdminClient>,
  databaseId: string,
  row: ModeratableCommentRow,
  event?: H3Event,
): Promise<void> {
  const threadRoot = row.rootId ?? row.$id
  // Ganzen Thread laden (alle Status → korrekte Baumstruktur), dann Nachfahren
  // per Fixpunkt-BFS ermitteln. Cursor-Pagination bis zur Erschöpfung — ein
  // hartes 500er-Fenster ließe Nachfahren jenseits davon sichtbar-aber-verwaist.
  const threadRows: ModeratableCommentRow[] = []
  try {
    let cursor: string | undefined
    while (threadRows.length < THREAD_HARD_CAP) {
      const pageRes = await admin.tablesDB.listRows<ModeratableCommentRow>({
        databaseId,
        tableId: COMMENTS_TABLE,
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

  const subtree = new Set<string>([row.$id])
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
  const toHide = threadRows.filter(r => r.$id !== row.$id && subtree.has(r.$id) && r.status === 'active')
  await Promise.all(toHide.map(r => hideCommentRow(admin, databaseId, r, event).catch((error) => {
    // best effort (kein 500 nach erfolgter Parent-Mutation), aber sichtbar
    console.error(`[moderation] Cascade-Hide für Nachfahre ${r.$id} fehlgeschlagen:`, error)
  })))
}
