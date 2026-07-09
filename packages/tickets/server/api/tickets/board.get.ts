import { Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketBoardResponse, type TicketListRow, type TicketRow } from '../../../shared/types/ticket'

/** Fälligkeits-Fenster des on-read-Sweeps (Muster events-Reminder) */
const DUE_SOON_MS = 24 * 3600_000

/**
 * Das komplette Board in einem Schuss — Listen + Karten, positionssortiert.
 * P4: on-read-Sweep für Fälligkeits-Reminder (offene Tickets, dueAt binnen
 * 24 h oder überfällig, noch nicht erinnert) — best-effort im Hintergrund,
 * idempotent über dueRemindedAt.
 */
export default defineEventHandler(async (event): Promise<TicketBoardResponse> => {
  requirePermission(event, 'tickets.manage')

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [lists, tickets] = await Promise.all([
    tablesDB.listRows<TicketListRow>({
      databaseId, tableId: TICKET_LISTS_TABLE,
      queries: [Query.orderAsc('position'), Query.limit(50)],
    }),
    tablesDB.listRows<TicketRow>({
      databaseId, tableId: TICKETS_TABLE,
      queries: [Query.orderAsc('position'), Query.limit(1000)],
    }),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load board')
  })

  const dueCutoff = Date.now() + DUE_SOON_MS
  const due = tickets.rows.filter(t =>
    t.status === 'open' && t.dueAt && !t.dueRemindedAt && Date.parse(t.dueAt) <= dueCutoff)
  if (due.length) {
    void (async () => {
      for (const ticket of due) {
        // Marker ZUERST (idempotent — parallele Board-Loads doppeln sonst)
        await tablesDB.updateRow({
          databaseId, tableId: TICKETS_TABLE, rowId: ticket.$id,
          data: { dueRemindedAt: new Date().toISOString() },
        })
        const overdue = Date.parse(ticket.dueAt!) < Date.now()
        await notifyTicketPeople(event, ticket, {
          title: ticket.title,
          body: overdue ? 'Das Ticket ist überfällig' : 'Das Ticket ist innerhalb von 24 Stunden fällig',
        })
      }
    })().catch(error => console.warn('[tickets] Fälligkeits-Sweep fehlgeschlagen:', error))
  }

  return { lists: lists.rows, tickets: tickets.rows }
})
