import { Query } from 'node-appwrite'
import { TICKETS_TABLE, TICKET_FILES_BUCKET, TICKET_FILES_TABLE, TICKET_WATCHERS_TABLE, type TicketFileRow, type TicketWatcherRow } from '../../../shared/types/ticket'

/**
 * Ticket endgültig löschen (Zurückstellen = Verschieben, kein Delete) —
 * kaskadiert auf Watcher, Anhang-Metadaten und Storage-Dateien (P4).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [watchers, files] = await Promise.all([
    admin.tablesDB.listRows<TicketWatcherRow>({
      databaseId, tableId: TICKET_WATCHERS_TABLE, queries: [Query.equal('ticketId', id), Query.limit(200)],
    }).catch(() => ({ rows: [] as TicketWatcherRow[] })),
    admin.tablesDB.listRows<TicketFileRow>({
      databaseId, tableId: TICKET_FILES_TABLE, queries: [Query.equal('ticketId', id), Query.limit(100)],
    }).catch(() => ({ rows: [] as TicketFileRow[] })),
  ])
  for (const watcher of watchers.rows) {
    await admin.tablesDB.deleteRow({ databaseId, tableId: TICKET_WATCHERS_TABLE, rowId: watcher.$id }).catch(() => {})
  }
  for (const file of files.rows) {
    await admin.storage.deleteFile({ bucketId: TICKET_FILES_BUCKET, fileId: file.fileId }).catch(() => {})
    await admin.tablesDB.deleteRow({ databaseId, tableId: TICKET_FILES_TABLE, rowId: file.$id }).catch(() => {})
  }

  await admin.tablesDB.deleteRow({
    databaseId,
    tableId: TICKETS_TABLE,
    rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not delete ticket')
  })

  return { ok: true }
})
