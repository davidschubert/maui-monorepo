import { EVENTS_TABLE, type EventRow } from '../../../../shared/types/event'

/** Cover entfernen (events.manage) — Row zuerst, Datei danach (best-effort). */
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
  if (!row.coverFileId) {
    return { ok: true }
  }

  await admin.tablesDB.updateRow({
    databaseId, tableId: EVENTS_TABLE, rowId: id, data: { coverFileId: null },
  }).catch((error) => { throw toH3Error(error, 'Could not remove cover') })

  await admin.storage.deleteFile({ bucketId: 'event-covers', fileId: row.coverFileId }).catch(() => {})

  return { ok: true }
})
