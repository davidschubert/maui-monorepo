import { EVENTS_TABLE, EVENT_COVERS_BUCKET, type EventRow } from '../../../../shared/types/event'

/**
 * Cover entfernen (events.manage) — Row zuerst, Datei danach (best-effort).
 * Datentür als Operator: get/update belegen die Zugehörigkeit.
 *
 * AUTORISIERUNG (N5): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const { actor } = await requireCommunityPermission(event, 'events.manage')

  // Wartungsmodus friert JEDEN Mitglieds-Schreibweg ein (utils/eventPolicy.ts).
  await assertEventsWritable(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const db = tenantDb(event, { as: 'operator', actor })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (!row.coverFileId) {
    return { ok: true }
  }

  await db.update(EVENTS_TABLE, id, { coverFileId: null }, 'Event not found')
    .catch((error) => { throw toH3Error(error, 'Could not remove cover') })

  await createAdminClient(event).storage.deleteFile({ bucketId: EVENT_COVERS_BUCKET, fileId: row.coverFileId }).catch(() => {})

  return { ok: true }
})
