import { Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketRow } from '../../../../shared/types/ticket'

/**
 * Liste MITSAMT ihrer Karten löschen — das UI bestätigt IMMER vorher und
 * nennt die Kartenzahl (Entscheidung 2026-07-08: kein 409-Schutz mehr;
 * wer Karten behalten will, verschiebt sie vorher).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const cards = await listAllRows<TicketRow>(tablesDB, databaseId, TICKETS_TABLE, [Query.equal('listId', id)])
    .catch((error) => {
      throw toH3Error(error, 'Could not load list cards')
    })
  for (const card of cards) {
    await tablesDB.deleteRow({ databaseId, tableId: TICKETS_TABLE, rowId: card.$id }).catch((error) => {
      throw toH3Error(error, 'Could not delete list cards')
    })
  }

  await tablesDB.deleteRow({ databaseId, tableId: TICKET_LISTS_TABLE, rowId: id }).catch((error) => {
    throw toH3Error(error, 'Could not delete list')
  })

  return { ok: true, deletedCards: cards.length }
})
