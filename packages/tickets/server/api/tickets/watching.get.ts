import { Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, TICKET_WATCHERS_TABLE, type TicketListRow, type TicketRow, type TicketWatcherRow, type TicketWatchingResponse } from '../../../shared/types/ticket'

/**
 * „Was beobachte ich?" — alle Watch-Einträge des aktuellen Users inkl.
 * Ticket-Daten und Listen-Titel (Beobachtet-Ansicht auf dem Board).
 */
export default defineEventHandler(async (event): Promise<TicketWatchingResponse> => {
  const user = requirePermission(event, 'tickets.manage')

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const watching = await tablesDB.listRows<TicketWatcherRow>({
    databaseId, tableId: TICKET_WATCHERS_TABLE,
    queries: [Query.equal('userId', user.$id), Query.limit(200)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load watch list')
  })

  const ticketIds = watching.rows.map(w => w.ticketId)
  if (ticketIds.length === 0) return { ticketIds: [], tickets: [] }

  const [tickets, lists] = await Promise.all([
    tablesDB.listRows<TicketRow>({
      databaseId, tableId: TICKETS_TABLE,
      queries: [Query.equal('$id', ticketIds), Query.limit(200)],
    }),
    tablesDB.listRows<TicketListRow>({
      databaseId, tableId: TICKET_LISTS_TABLE,
      queries: [Query.limit(50)],
    }),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load watched tickets')
  })

  const listTitle = new Map(lists.rows.map(list => [list.$id, list.title]))
  return {
    ticketIds,
    tickets: tickets.rows.map(ticket => ({ ...ticket, listTitle: listTitle.get(ticket.listId) ?? '' })),
  }
})
