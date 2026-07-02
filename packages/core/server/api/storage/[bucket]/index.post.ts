import { ID, Permission, Role } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { createSessionClient } from '../../../lib/appwrite'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * Magic-Bytes-Check: der deklarierte MIME-Typ ist Client-Input — hier wird
 * geprüft, dass der INHALT tatsächlich eines der erlaubten Bildformate ist
 * (PNG/JPEG/WebP/GIF). Verhindert, dass z. B. HTML/SVG mit gefälschtem
 * Content-Type hochgeladen und später ausgeliefert wird.
 */
function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'image/jpeg'
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('latin1'))) return 'image/gif'
  return null
}

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
  // Allowlist: nur der App-Avatars-Bucket — kein Schreiben in beliebige Buckets
  const config = useRuntimeConfig(event)
  if (!config.public.appwriteAvatarsBucket || bucketId !== config.public.appwriteAvatarsBucket) {
    throw createError({ status: 403, statusText: 'Unknown bucket' })
  }

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    throw createError({ status: 400, statusText: 'Missing file field' })
  }
  // Typ MUSS vorhanden + erlaubt sein (fehlender Typ darf den Check nicht umgehen)
  if (!filePart.type || !ALLOWED_MIME.has(filePart.type)) {
    throw createError({ status: 415, statusText: 'Unsupported file type' })
  }
  // … und der Inhalt muss zum deklarierten Typ passen (Magic Bytes)
  const sniffed = sniffImageMime(filePart.data)
  if (sniffed !== filePart.type) {
    throw createError({ status: 415, statusText: 'File content does not match its type' })
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
