import { ticketPatchSchema } from '../../../schemas/ticket'
import { TICKETS_TABLE, type TicketRow } from '../../../shared/types/ticket'

/**
 * Ticket ändern — Felder, Erledigt-Toggle und Move (listId und/oder position)
 * in einer Route; der Client patcht optimistisch und Realtime synct den Rest.
 */
export default defineEventHandler(async (event): Promise<TicketRow> => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const body = await readValidatedBody(event, ticketPatchSchema.parse)
  if (body.listId) await requireTicketList(event, body.listId)

  const data: Record<string, unknown> = {}
  if (body.listId !== undefined) data.listId = body.listId
  if (body.position !== undefined) data.position = body.position
  if (body.title !== undefined) data.title = body.title
  if (body.description !== undefined) data.description = body.description
  if (body.label !== undefined) data.label = body.label
  if (body.priority !== undefined) data.priority = body.priority
  if (body.effort !== undefined) data.effort = body.effort
  if (body.startAt !== undefined) data.startAt = body.startAt
  if (body.dueAt !== undefined) data.dueAt = body.dueAt
  if (body.checklist !== undefined) data.checklist = body.checklist.length ? JSON.stringify(body.checklist) : ''
  if (body.members !== undefined) data.membersJson = body.members.length ? JSON.stringify(body.members) : ''
  if (body.status !== undefined) {
    data.status = body.status
    data.doneAt = body.status === 'done' ? new Date().toISOString() : null
  }
  if (Object.keys(data).length === 0) {
    throw createError({ status: 400, statusText: 'Empty patch' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  return await tablesDB.updateRow<TicketRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKETS_TABLE,
    rowId: id,
    data,
  }).catch((error) => {
    throw toH3Error(error, 'Could not update ticket')
  })
})
