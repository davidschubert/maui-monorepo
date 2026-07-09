import { listPatchSchema } from '../../../../schemas/ticket'
import { TICKET_LISTS_TABLE, type TicketListRow } from '../../../../shared/types/ticket'

/** Liste umbenennen und/oder verschieben (position). */
export default defineEventHandler(async (event): Promise<TicketListRow> => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const body = await readValidatedBody(event, listPatchSchema.parse)
  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.position !== undefined) data.position = body.position
  if (Object.keys(data).length === 0) {
    throw createError({ status: 400, statusText: 'Empty patch' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  return await tablesDB.updateRow<TicketListRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKET_LISTS_TABLE,
    rowId: id,
    data,
  }).catch((error) => {
    throw toH3Error(error, 'Could not update list')
  })
})
