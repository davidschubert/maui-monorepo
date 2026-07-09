import { ID } from 'node-appwrite'
import { TICKETS_TABLE, type TicketRow } from '../../../../shared/types/ticket'

/** Ticket kopieren — Kopie landet direkt unter dem Original (position + 1). */
export default defineEventHandler(async (event): Promise<TicketRow> => {
  const user = requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const source = await tablesDB.getRow<TicketRow>({
    databaseId, tableId: TICKETS_TABLE, rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not load ticket')
  })

  return await tablesDB.createRow<TicketRow>({
    databaseId, tableId: TICKETS_TABLE, rowId: ID.unique(),
    data: {
      listId: source.listId,
      title: source.title,
      description: source.description,
      label: source.label,
      priority: source.priority,
      effort: source.effort,
      startAt: source.startAt,
      dueAt: source.dueAt,
      checklist: source.checklist,
      membersJson: source.membersJson,
      status: 'open',
      doneAt: null,
      position: source.position + 1,
      feedbackId: '',
      createdBy: user.$id,
      createdByName: user.name ?? '',
    },
  }).catch((error) => {
    throw toH3Error(error, 'Could not duplicate ticket')
  })
})
