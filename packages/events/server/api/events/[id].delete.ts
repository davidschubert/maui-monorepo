import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Event absagen — SOFT-Cancel (events.manage): status 'cancelled', die Row
 * bleibt (Teilnehmer sollen die Absage sehen, Leserecht bleibt bestehen).
 * Kein Hard-Delete im API-Vertrag (v1). Idempotent. Datentür als Operator:
 * get/update belegen die Zugehörigkeit — ein fremder Mandant bekommt 404.
 *
 * AUTORISIERUNG (N5): `requireSitePermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  await requireSitePermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (row.status === 'cancelled') {
    return { ok: true }
  }

  await db.update(EVENTS_TABLE, id, { status: 'cancelled' }, 'Event not found').catch((error) => {
    throw toH3Error(error, 'Could not cancel event')
  })

  return { ok: true }
})
