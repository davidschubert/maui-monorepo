import { Query } from 'node-appwrite'
import { TICKET_FILES_BUCKET, TICKET_FILES_TABLE, type TicketFileRow } from '../../../../shared/types/ticket'

/**
 * Anhang ausliefern — Permission-geprüft über unsere Route (der Bucket hat
 * bewusst KEINE öffentlichen Permissions). Content-Disposition inline für
 * Bilder/PDF (Browser-Vorschau), attachment für den Rest.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const fileId = getRouterParam(event, 'fileId')
  if (!fileId) throw createError({ status: 400, statusText: 'Missing fileId' })

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const meta = await admin.tablesDB.listRows<TicketFileRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: TICKET_FILES_TABLE,
    queries: [Query.equal('fileId', fileId), Query.limit(1)],
  }).catch((error) => {
    throw toH3Error(error, 'File not found')
  })
  const file = meta.rows[0]
  if (!file) throw createError({ status: 404, statusText: 'File not found' })

  const bytes = await admin.storage.getFileView({ bucketId: TICKET_FILES_BUCKET, fileId }).catch((error) => {
    throw toH3Error(error, 'Could not read file')
  })

  const inline = file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf'
  setHeader(event, 'Content-Type', file.mimeType || 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.name)}"`)
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return Buffer.from(bytes as ArrayBuffer)
})
