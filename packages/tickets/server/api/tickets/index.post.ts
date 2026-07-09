import { ID } from 'node-appwrite'
import { ticketCreateSchema } from '../../../schemas/ticket'
import { TICKETS_TABLE, type TicketRow } from '../../../shared/types/ticket'

/** Ticket anlegen — ans Ende der Ziel-Liste. */
export default defineEventHandler(async (event): Promise<TicketRow> => {
  const user = requirePermission(event, 'tickets.manage')
  const body = await readValidatedBody(event, ticketCreateSchema.parse)

  await requireTicketList(event, body.listId)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const position = await nextTicketPosition(tablesDB, databaseId, TICKETS_TABLE, body.listId)

  return await tablesDB.createRow<TicketRow>({
    databaseId, tableId: TICKETS_TABLE, rowId: ID.unique(),
    data: {
      listId: body.listId,
      title: body.title,
      description: body.description,
      label: body.label,
      priority: body.priority,
      effort: body.effort,
      startAt: body.startAt,
      dueAt: body.dueAt,
      checklist: body.checklist.length ? JSON.stringify(body.checklist) : '',
      membersJson: body.members.length ? JSON.stringify(body.members) : '',
      status: 'open',
      doneAt: null,
      dueRemindedAt: null,
      position,
      feedbackId: '',
      createdBy: user.$id,
      createdByName: user.name ?? '',
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not create ticket')
  })
})
