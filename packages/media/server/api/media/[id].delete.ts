import { MEDIA_TABLE, MEDIA_BUCKET, type MediaItem } from '../../../shared/types/media'

/** Medien-Eintrag löschen (media.manage) — Row zuerst, dann Datei (best-effort). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'media.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing media id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const row = await admin.tablesDB.getRow<MediaItem>({ databaseId, tableId: MEDIA_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Media item not found') })

  await admin.tablesDB.deleteRow({ databaseId, tableId: MEDIA_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Could not delete media item') })

  // Datei best-effort — eine Waise im Bucket ist ärgerlich, aber kein Leak
  // (Row weg = nicht mehr gelistet); laut loggen statt 500 nach Row-Delete.
  await admin.storage.deleteFile({ bucketId: MEDIA_BUCKET, fileId: row.fileId }).catch((error) => {
    console.error(`[media] Datei ${row.fileId} zu gelöschtem Eintrag ${id} konnte nicht entfernt werden:`, error)
  })

  return { ok: true }
})
