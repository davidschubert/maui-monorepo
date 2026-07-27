import { EVENTS_TABLE, type EventRow } from '../../../../shared/types/event'

/**
 * Cover entfernen (events.manage) — Row zuerst, Datei danach (best-effort).
 * Datentür als Operator: get/update belegen die Zugehörigkeit.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  requirePermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (!row.coverFileId) {
    return { ok: true }
  }

  await db.update(EVENTS_TABLE, id, { coverFileId: null }, 'Event not found')
    .catch((error) => { throw toH3Error(error, 'Could not remove cover') })

  await createAdminClient(event).storage.deleteFile({ bucketId: 'event-covers', fileId: row.coverFileId }).catch(() => {})

  return { ok: true }
})
