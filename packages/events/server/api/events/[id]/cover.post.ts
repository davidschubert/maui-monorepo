import { ID, Query } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { EVENTS_TABLE, MAX_EVENT_COVER_BYTES, isSeriesEvent, isSeriesMaster, type EventRow } from '../../../../shared/types/event'

/**
 * Cover-Upload (events.manage): JPEG/PNG/WebP mit Magic-Bytes-Check —
 * der deklarierte MIME-Typ ist Client-Input (Muster fonts/upload).
 * Bucket 'event-covers' (Migration events-002): öffentlich lesbar,
 * geschrieben wird nur hier. Ersetzt ein vorhandenes Cover (altes File
 * wird gelöscht, best-effort). Rows über die Datentür als Operator
 * (get/update belegen die Zugehörigkeit); Storage bleibt Admin-Client —
 * Files tragen keinen Mandanten, die Referenz (coverFileId) tut es.
 *
 * AUTORISIERUNG (N5): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 *
 * WER HANDELT (F17): Redaktion an INHALT (das Bild IST der Termin, wie bei den
 * Medien-Wegen aus C1c) — `actor` aus dem Gate. Reihenfolge beachtet: die
 * Inhalts-Sperre schlägt beim `db.update` zu, also NACH dem Storage-Upload;
 * der bestehende Aufräum-Zweig löscht die verwaiste Datei dann mit.
 */
function isImage(data: Buffer): boolean {
  if (data.length < 12) return false
  const jpeg = data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF
  const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
  const webp = data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
  return jpeg || png || webp
}

export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const { actor } = await requireCommunityPermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const db = tenantDb(event, { as: 'operator', actor })
  const admin = createAdminClient(event)

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')

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

  await db.update(EVENTS_TABLE, id, { coverFileId: file.$id }, 'Event not found').catch(async (error) => {
    // Row-Update gescheitert → verwaiste Datei nicht liegen lassen
    await admin.storage.deleteFile({ bucketId: 'event-covers', fileId: file.$id }).catch(() => {})
    throw toH3Error(error, 'Could not save cover')
  })

  // Serie (§7e): neues MASTER-Cover auf Instanzen propagieren, die noch das
  // alte (oder kein) Cover tragen — individuell gesetzte Cover bleiben
  if (isSeriesMaster(row)) {
    const instances = await db.list<EventRow>(EVENTS_TABLE, [
      Query.equal('seriesId', row.$id), Query.notEqual('$id', row.$id), Query.limit(200),
    ]).catch(() => ({ rows: [] as EventRow[] }))
    for (const instance of instances.rows) {
      if (instance.coverFileId !== row.coverFileId) continue
      await db.update(EVENTS_TABLE, instance.$id, { coverFileId: file.$id }).catch(() => {})
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
