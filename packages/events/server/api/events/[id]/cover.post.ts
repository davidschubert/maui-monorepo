import { ID, Query } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { EVENTS_TABLE, MAX_EVENT_COVER_BYTES, isSeriesEvent, isSeriesMaster, type EventRow } from '../../../../shared/types/event'

/**
 * Cover-Upload (events.manage): JPEG/PNG/WebP mit Magic-Bytes-Check —
 * der deklarierte MIME-Typ ist Client-Input (Muster fonts/upload).
 * Bucket 'event-covers' (Migration events-002): öffentlich lesbar,
 * geschrieben wird nur hier. Ersetzt ein vorhandenes Cover (altes File
 * wird gelöscht, best-effort).
 */
function isImage(data: Buffer): boolean {
  if (data.length < 12) return false
  const jpeg = data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF
  const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
  const webp = data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
  return jpeg || png || webp
}

export default defineEventHandler(async (event) => {
  requirePermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<EventRow>({ databaseId, tableId: EVENTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Event not found') })

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    throw createError({ status: 400, statusText: 'Missing file field' })
  }
  if (!/\.(jpe?g|png|webp)$/i.test(filePart.filename) || !isImage(filePart.data)) {
    throw createError({ status: 415, statusText: 'Only JPEG, PNG or WebP images are supported' })
  }
  if (filePart.data.length > MAX_EVENT_COVER_BYTES) {
    throw createError({ status: 413, statusText: 'File too large' })
  }

  const file = await admin.storage.createFile({
    bucketId: 'event-covers',
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, filePart.filename),
  }).catch((error) => { throw toH3Error(error, 'Covers bucket missing — run migrations') })

  await admin.tablesDB.updateRow({
    databaseId, tableId: EVENTS_TABLE, rowId: id, data: { coverFileId: file.$id },
  }).catch(async (error) => {
    // Row-Update gescheitert → verwaiste Datei nicht liegen lassen
    await admin.storage.deleteFile({ bucketId: 'event-covers', fileId: file.$id }).catch(() => {})
    throw toH3Error(error, 'Could not save cover')
  })

  // Serie (§7e): neues MASTER-Cover auf Instanzen propagieren, die noch das
  // alte (oder kein) Cover tragen — individuell gesetzte Cover bleiben
  if (isSeriesMaster(row)) {
    const instances = await admin.tablesDB.listRows<EventRow>({
      databaseId, tableId: EVENTS_TABLE,
      queries: [Query.equal('seriesId', row.$id), Query.notEqual('$id', row.$id), Query.limit(200)],
    }).catch(() => ({ rows: [] as EventRow[] }))
    for (const instance of instances.rows) {
      if (instance.coverFileId !== row.coverFileId) continue
      await admin.tablesDB.updateRow({
        databaseId, tableId: EVENTS_TABLE, rowId: instance.$id, data: { coverFileId: file.$id },
      }).catch(() => {})
    }
  }

  // Altes File löschen — bei Serien-INSTANZEN bewusst nicht: das alte Cover
  // ist dort meist das geteilte Master-Cover (Master + Geschwister nutzen es
  // weiter). Master ist safe: die Propagation oben hat alle Verweise umgebogen.
  if (row.coverFileId && !(isSeriesEvent(row) && !isSeriesMaster(row))) {
    await admin.storage.deleteFile({ bucketId: 'event-covers', fileId: row.coverFileId }).catch(() => {})
  }

  setResponseStatus(event, 201)
  return { fileId: file.$id }
})
