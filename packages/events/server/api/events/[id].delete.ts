import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Event absagen — SOFT-Cancel (events.manage): status 'cancelled', die Row
 * bleibt (Teilnehmer sollen die Absage sehen, Leserecht bleibt bestehen).
 * Kein Hard-Delete im API-Vertrag (v1). Idempotent.
 */
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
  if (row.status === 'cancelled') {
    return { ok: true }
  }

  await admin.tablesDB.updateRow({
    databaseId,
    tableId: EVENTS_TABLE,
    rowId: id,
    data: { status: 'cancelled' },
  }).catch((error) => {
    throw toH3Error(error, 'Could not cancel event')
  })

  return { ok: true }
})
