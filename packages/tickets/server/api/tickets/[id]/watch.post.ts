import { ID } from 'node-appwrite'
import { TICKET_WATCHERS_TABLE } from '../../../../shared/types/ticket'

/** Ticket beobachten (idempotent — Unique-Index fängt Doppel-Watch). */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  await requireTicketExists(event, id)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  try {
    await tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: TICKET_WATCHERS_TABLE,
      rowId: ID.unique(),
      data: { ticketId: id, userId: user.$id, userName: user.name ?? '' },
    })
  }
  catch (error) {
    // 409 = beobachtet schon — idempotent OK
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 409)) {
      throw toH3Error(error, 'Could not watch ticket')
    }
  }

  return { watching: true }
})
