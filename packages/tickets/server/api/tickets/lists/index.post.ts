import { ID } from 'node-appwrite'
import { listCreateSchema } from '../../../../schemas/ticket'
import { TICKET_LISTS_TABLE, type TicketListRow } from '../../../../shared/types/ticket'

/** Liste anlegen — ans Ende des Boards. */
export default defineEventHandler(async (event): Promise<TicketListRow> => {
  requirePermission(event, 'tickets.manage')
  const body = await readValidatedBody(event, listCreateSchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const position = await nextTicketPosition(tablesDB, databaseId, TICKET_LISTS_TABLE)

  return await tablesDB.createRow<TicketListRow>({
    databaseId, tableId: TICKET_LISTS_TABLE, rowId: ID.unique(),
    data: { title: body.title, position },
  }).catch((error) => {
    throw toH3Error(error, 'Could not create list')
  })
})
