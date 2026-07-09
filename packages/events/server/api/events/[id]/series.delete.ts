import { Query } from 'node-appwrite'
import { EVENTS_TABLE, isSeriesMaster, type EventRow } from '../../../../shared/types/event'

/**
 * Serie beenden (§7e): seriesUntil = jetzt (das Top-up erzeugt nichts mehr)
 * und alle KÜNFTIGEN Instanzen werden soft abgesagt (Muster Event-Absage —
 * Rows bleiben sichtbar, Teilnehmer sehen die Absage). Vergangene Termine
 * bleiben unangetastet. Idempotent.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing event id' })

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const master = await admin.tablesDB.getRow<EventRow>({ databaseId, tableId: EVENTS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Event not found') })
  if (!isSeriesMaster(master)) {
    throw createError({ status: 409, statusText: 'Not a series master' })
  }

  const now = new Date().toISOString()
  await admin.tablesDB.updateRow({
    databaseId, tableId: EVENTS_TABLE, rowId: master.$id,
    data: { seriesUntil: now },
  }).catch((error) => {
    throw toH3Error(error, 'Could not stop series')
  })

  // Künftige Instanzen (inkl. Master, falls sein Termin noch aussteht) absagen
  const future = await admin.tablesDB.listRows<EventRow>({
    databaseId, tableId: EVENTS_TABLE,
    queries: [Query.equal('seriesId', master.$id), Query.greaterThan('startAt', now), Query.limit(200)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load series instances')
  })

  let cancelled = 0
  for (const instance of future.rows) {
    if (instance.status === 'cancelled') continue
    await admin.tablesDB.updateRow({
      databaseId, tableId: EVENTS_TABLE, rowId: instance.$id, data: { status: 'cancelled' },
    }).catch((error) => {
      throw toH3Error(error, 'Could not cancel series instance')
    })
    cancelled++
  }

  return { ok: true, cancelled }
})
