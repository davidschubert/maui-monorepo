import { ID } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { TICKET_FILES_BUCKET, TICKET_FILES_TABLE, type TicketFileRow } from '../../../../shared/types/ticket'

/**
 * Anhang hochladen (multipart) — Bilder/PDF per Magic Bytes, Text-Formate
 * per Heuristik (ticketFiles.ts); max 10 MB. Datei landet im Bucket
 * 'ticket-files' (ohne öffentliche Permissions — Serving nur über unsere
 * Download-Route), Metadaten in ticket_files.
 */
export default defineEventHandler(async (event): Promise<TicketFileRow> => {
  const user = requirePermission(event, 'tickets.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })

  await requireTicketExists(event, id)

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(part => part.name === 'file' && part.data?.length)
  if (!filePart?.data) {
    throw createError({ status: 400, statusText: 'Missing file' })
  }

  const filename = (filePart.filename ?? 'datei').slice(0, 200)
  const detected = detectTicketFileType(filePart.data, filename)
  if (!detected) {
    throw createError({ status: 415, statusText: 'Unsupported file type' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const stored = await admin.storage.createFile({
    bucketId: TICKET_FILES_BUCKET,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, filename),
  }).catch((error) => {
    throw toH3Error(error, 'Could not store file')
  })

  return await admin.tablesDB.createRow<TicketFileRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKET_FILES_TABLE,
    rowId: ID.unique(),
    data: {
      ticketId: id,
      fileId: stored.$id,
      name: filename,
      mimeType: detected.mimeType,
      size: filePart.data.length,
      uploadedBy: user.$id,
    },
  }).catch(async (error) => {
    // Storage-Leiche vermeiden, wenn die Metadaten-Row scheitert
    await admin.storage.deleteFile({ bucketId: TICKET_FILES_BUCKET, fileId: stored.$id }).catch(() => {})
    throw toH3Error(error, 'Could not save file metadata')
  })
})
