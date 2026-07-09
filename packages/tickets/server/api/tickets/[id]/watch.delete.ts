import { Query } from 'node-appwrite'
import { TICKET_WATCHERS_TABLE, type TicketWatcherRow } from '../../../../shared/types/ticket'

/** Beobachten beenden. */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const existing = await tablesDB.listRows<TicketWatcherRow>({
    databaseId, tableId: TICKET_WATCHERS_TABLE,
    queries: [Query.equal('ticketId', id), Query.equal('userId', user.$id), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not unwatch ticket')
  })

  for (const row of existing.rows) {
    await tablesDB.deleteRow({ databaseId, tableId: TICKET_WATCHERS_TABLE, rowId: row.$id }).catch((error) => {
      throw toH3Error(error, 'Could not unwatch ticket')
    })
  }

  return { watching: false }
})
