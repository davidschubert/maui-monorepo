import { Query } from 'node-appwrite'
import { TICKET_FILES_BUCKET, TICKET_FILES_TABLE, type TicketFileRow } from '../../../../shared/types/ticket'

/** Anhang löschen (Storage + Metadaten-Row). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const fileId = getRouterParam(event, 'fileId')
  if (!fileId) throw createError({ status: 400, statusText: 'Missing fileId' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const meta = await admin.tablesDB.listRows<TicketFileRow>({
    databaseId, tableId: TICKET_FILES_TABLE,
    queries: [Query.equal('fileId', fileId), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'File not found')
  })
  const file = meta.rows[0]
  if (!file) throw createError({ status: 404, statusText: 'File not found' })

  await admin.storage.deleteFile({ bucketId: TICKET_FILES_BUCKET, fileId }).catch((error) => {
    throw toH3Error(error, 'Could not delete file')
  })
  await admin.tablesDB.deleteRow({ databaseId, tableId: TICKET_FILES_TABLE, rowId: file.$id }).catch((error) => {
    throw toH3Error(error, 'Could not delete file metadata')
  })

  return { ok: true }
})
