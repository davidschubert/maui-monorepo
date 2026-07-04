import { ID } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

const MAX_BYTES = 3 * 1024 * 1024

/** Magic-Bytes-Check: WOFF2 beginnt mit 'wOF2' — der deklarierte MIME-Typ ist Client-Input. */
function isWoff2(data: Buffer): boolean {
  return data.length >= 4 && data.subarray(0, 4).toString('latin1') === 'wOF2'
}

/**
 * Theme-Studio: einzelne Schriftdatei hochladen (nur WOFF2) — liefert die
 * fileId, die der Client anschließend beim Anlegen/Bearbeiten der Schrift
 * einem Gewicht zuordnet. Bucket 'fonts' (Migration system-012): öffentlich
 * lesbar, geschrieben wird nur hier (Server-Key).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    throw createError({ status: 400, statusText: 'Missing file field' })
  }
  if (!filePart.filename.toLowerCase().endsWith('.woff2') || !isWoff2(filePart.data)) {
    throw createError({ status: 415, statusText: 'Only WOFF2 files are supported' })
  }
  if (filePart.data.length > MAX_BYTES) {
    throw createError({ status: 413, statusText: 'File too large' })
  }

  const admin = createAdminClient(event)
  const file = await admin.storage.createFile({
    bucketId: 'fonts',
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, filePart.filename),
  }).catch((error) => { throw toH3Error(error, 'Fonts bucket missing — run migrations') })

  setResponseStatus(event, 201)
  return { fileId: file.$id }
})
