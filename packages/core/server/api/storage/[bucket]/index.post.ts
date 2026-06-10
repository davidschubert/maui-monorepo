import { ID } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { createSessionClient } from '../../../lib/appwrite'

/**
 * Datei-Upload via SessionClient — läuft mit den Rechten des Users.
 * Buckets gehören der App (Core besitzt keine Appwrite-Ressourcen).
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const bucketId = getRouterParam(event, 'bucket')
  if (!bucketId) {
    throw createError({ status: 400, statusText: 'Missing bucket id' })
  }

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    throw createError({ status: 400, statusText: 'Missing file field' })
  }

  const { storage } = createSessionClient(event)

  return await storage.createFile({
    bucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, filePart.filename),
  })
})
