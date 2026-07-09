import { Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_LISTS_TABLE } from '../../../../shared/types/ticket'

/** Liste löschen — nur wenn leer (409 sonst; Karten erst verschieben). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const cards = await tablesDB.listRows({
    databaseId, tableId: TICKETS_TABLE,
    queries: [Query.equal('listId', id), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not check list')
  })
  if (cards.total > 0) {
    throw createError({ status: 409, statusText: 'List not empty' })
  }

  await tablesDB.deleteRow({ databaseId, tableId: TICKET_LISTS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not delete list')
  })

  return { ok: true }
})
