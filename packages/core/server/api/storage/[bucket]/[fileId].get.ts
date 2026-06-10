import { createSessionClient } from '../../../lib/appwrite'

/** Liefert den Datei-Inhalt mit korrektem Content-Type (SessionClient). */
export default defineEventHandler(async (event) => {
  const bucketId = getRouterParam(event, 'bucket')
  const fileId = getRouterParam(event, 'fileId')
  if (!bucketId || !fileId) {
    throw createError({ status: 400, statusText: 'Missing bucket or file id' })
  }

  const { storage } = createSessionClient(event)

  const meta = await storage.getFile({ bucketId, fileId })
  const data = await storage.getFileView({ bucketId, fileId })

  setHeader(event, 'Content-Type', meta.mimeType)
  return Buffer.from(data)
})
