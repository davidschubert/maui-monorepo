import { ID, Permission, Role } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { createSessionClient } from '../../../lib/appwrite'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * Datei-Upload via SessionClient — läuft mit den Rechten des Users.
 * Buckets gehören der App (Core besitzt keine Appwrite-Ressourcen).
 * Datei-Rechte: öffentlich lesbar (Avatare überall sichtbar), nur der
 * Besitzer darf ersetzen/löschen.
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
  if (filePart.type && !ALLOWED_MIME.has(filePart.type)) {
    throw createError({ status: 415, statusText: 'Unsupported file type' })
  }
  if (filePart.data.length > MAX_BYTES) {
    throw createError({ status: 413, statusText: 'File too large' })
  }

  const { storage } = createSessionClient(event)
  const userId = event.context.user.$id

  return await storage.createFile({
    bucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, filePart.filename),
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  })
})
