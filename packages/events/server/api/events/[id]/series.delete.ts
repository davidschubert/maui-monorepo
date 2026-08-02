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
 * WER HANDELT (F17): kein `actor` — Absagen bleibt auch in einer
 * billing-gesperrten Community OFFEN (Davids Entscheidung 2026-08-02).
 * Begründung und die überstimmten Gegenargumente stehen einmal ausführlich in
 * `[id].delete.ts`; hier gilt dieselbe eng gezogene Ausnahme: NUR Beenden,
 * nicht Anlegen oder Ändern.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  await requireCommunityPermission(event, 'events.manage')

  // Wartungsmodus friert JEDEN Mitglieds-Schreibweg ein (utils/eventPolicy.ts).
  await assertEventsWritable(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing event id' })

  const db = tenantDb(event, { as: 'operator' }) // kein `actor`: Absagen bleibt offen (s. Kopf)

  const master = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (!isSeriesMaster(master)) {
    throw createError({ status: 409, statusText: 'Not a series master' })
  }

  const now = new Date().toISOString()
  await db.update(EVENTS_TABLE, master.$id, { seriesUntil: now }, 'Event not found').catch((error) => {
    throw toH3Error(error, 'Could not stop series')
  })

  // Künftige Instanzen (inkl. Master, falls sein Termin noch aussteht) absagen.
  // Cursor-paginiert statt limit(200): „Serie beenden" ist der Weg, bei dem ein
  // stiller Deckel am teuersten wäre — er ließe Termine stehen, die der Owner
  // für abgesagt hält (Audit-Befund 2026-08-02).
  const future = await listSeriesInstances(db, master.$id, [Query.greaterThan('startAt', now)])
    .catch((error) => {
      throw toH3Error(error, 'Could not load series instances')
    })

  let cancelled = 0
  for (const instance of future) {
    if (instance.status === 'cancelled') continue
    await db.update(EVENTS_TABLE, instance.$id, { status: 'cancelled' }).catch((error) => {
      throw toH3Error(error, 'Could not cancel series instance')
    })
    cancelled++
  }

  return { ok: true, cancelled }
})
