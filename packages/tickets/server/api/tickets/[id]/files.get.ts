import { Query } from 'node-appwrite'
import { TICKET_FILES_TABLE, type TicketFileRow } from '../../../../shared/types/ticket'

/** Anhänge eines Tickets. */
export default defineEventHandler(async (event): Promise<{ files: TicketFileRow[] }> => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const res = await tablesDB.listRows<TicketFileRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKET_FILES_TABLE,
    queries: [Query.equal('ticketId', id), Query.orderAsc('$createdAt'), Query.limit(50)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load files')
  })

  return { files: res.rows }
})
