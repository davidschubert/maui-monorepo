import { TICKETS_TABLE } from '../../../shared/types/ticket'

/** Ticket endgültig löschen (Zurückstellen = Verschieben, kein Delete). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  await tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKETS_TABLE,
    rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not delete ticket')
  })

  return { ok: true }
})
