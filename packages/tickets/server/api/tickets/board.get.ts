import { Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketBoardResponse, type TicketListRow, type TicketRow } from '../../../shared/types/ticket'

/** Das komplette Board in einem Schuss — Listen + Karten, positionssortiert. */
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

  return { lists: lists.rows, tickets: tickets.rows }
})
