import { ID, Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketListRow, type TicketRow } from '../../../../../shared/types/ticket'

/** Liste inklusive aller Karten kopieren — Kopie direkt rechts daneben. */
export default defineEventHandler(async (event): Promise<TicketListRow> => {
  const user = requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const source = await tablesDB.getRow<TicketListRow>({
    databaseId, tableId: TICKET_LISTS_TABLE, rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not load list')
  })

  const copy = await tablesDB.createRow<TicketListRow>({
    databaseId, tableId: TICKET_LISTS_TABLE, rowId: ID.unique(),
    data: { title: source.title, position: source.position + 1 },
  }).catch((error) => {
    throw toH3Error(error, 'Could not duplicate list')
  })

  const cards = await tablesDB.listRows<TicketRow>({
    databaseId, tableId: TICKETS_TABLE,
    queries: [Query.equal('listId', id), Query.orderAsc('position'), Query.limit(500)],
  })
  for (const card of cards.rows) {
    await tablesDB.createRow({
      databaseId, tableId: TICKETS_TABLE, rowId: ID.unique(),
      data: {
        listId: copy.$id,
        title: card.title,
        description: card.description,
        label: card.label,
        priority: card.priority,
        effort: card.effort,
        startAt: card.startAt,
        dueAt: card.dueAt,
        checklist: card.checklist,
        membersJson: card.membersJson,
        status: 'open',
        doneAt: null,
        dueRemindedAt: null,
        position: card.position,
        feedbackId: '',
        createdBy: user.$id,
        createdByName: user.name ?? '',
      },
    }).catch((error) => {
      throw toH3Error(error, 'Could not duplicate list cards')
    })
  }

  return copy
})
