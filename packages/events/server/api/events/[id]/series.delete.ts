import { Query } from 'node-appwrite'
import { EVENTS_TABLE, isSeriesMaster, type EventRow } from '../../../../shared/types/event'

/**
 * Serie beenden (§7e): seriesUntil = jetzt (das Top-up erzeugt nichts mehr)
 * und alle KÜNFTIGEN Instanzen werden soft abgesagt (Muster Event-Absage —
 * Rows bleiben sichtbar, Teilnehmer sehen die Absage). Vergangene Termine
 * bleiben unangetastet. Idempotent. Datentür als Operator: get/list/update
 * belegen bzw. scopen die Zugehörigkeit — fremde Serien bekommen 404.
 *
 * AUTORISIERUNG (N5): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate, dieselbe
 * Entscheidung und dieselbe Begründung wie beim Absagen eines einzelnen
 * Termins ([id].delete.ts).
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const { actor } = await requireCommunityPermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing event id' })

  const db = tenantDb(event, { as: 'operator', actor })

  const master = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (!isSeriesMaster(master)) {
    throw createError({ status: 409, statusText: 'Not a series master' })
  }

  const now = new Date().toISOString()
  await db.update(EVENTS_TABLE, master.$id, { seriesUntil: now }, 'Event not found').catch((error) => {
    throw toH3Error(error, 'Could not stop series')
  })

  // Künftige Instanzen (inkl. Master, falls sein Termin noch aussteht) absagen
  const future = await db.list<EventRow>(EVENTS_TABLE, [
    Query.equal('seriesId', master.$id), Query.greaterThan('startAt', now), Query.limit(200),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load series instances')
  })

  let cancelled = 0
  for (const instance of future.rows) {
    if (instance.status === 'cancelled') continue
    await db.update(EVENTS_TABLE, instance.$id, { status: 'cancelled' }).catch((error) => {
      throw toH3Error(error, 'Could not cancel series instance')
    })
    cancelled++
  }

  return { ok: true, cancelled }
})
