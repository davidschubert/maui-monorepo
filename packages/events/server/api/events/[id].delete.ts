import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Event absagen — SOFT-Cancel (events.manage): status 'cancelled', die Row
 * bleibt (Teilnehmer sollen die Absage sehen, Leserecht bleibt bestehen).
 * Kein Hard-Delete im API-Vertrag (v1). Idempotent. Datentür als Operator:
 * get/update belegen die Zugehörigkeit — ein fremder Mandant bekommt 404.
 *
 * AUTORISIERUNG (N5): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 *
 * WER HANDELT (F17) — und das war der EINE strittige Fall der Durchsicht:
 * Absagen ist technisch ein Status-Write auf einer Inhalts-Zeile, also
 * Redaktion ⇒ `actor` aus dem Gate, und damit in einer billing-gesperrten
 * Community ZU. Dagegen sprach: eine Absage schützt die ZUSAGENDEN, und die
 * haben mit der offenen Rechnung nichts zu tun.
 *
 * Trotzdem so entschieden, aus drei Gründen:
 *  1. Eine Absage ist keine Rücknahme, sondern eine neue Aussage an alle
 *     Teilnehmer (die Row bleibt sichtbar und sagt jetzt „abgesagt") — genau
 *     die Sorte Schreibvorgang, die die Sperre meint.
 *  2. Eine Ausnahme „löschen darf man, anlegen nicht" ist die Art Loch, die
 *     sich fortschreibt: der nächste Weg beruft sich darauf.
 *  3. Die Sperre ist eine MAHNUNG und in Minuten aufgehoben — der Owner hat
 *     einen Weg, der Betreiber hat das Break-Glass (das hier weiter durchgeht,
 *     weil `actor` dann 'operator' ist).
 * Fällt Davids Entscheidung anders aus, ist die Änderung EINE Zeile: `actor`
 * hier nicht durchreichen. Die Begründung muss dann hier stehen bleiben.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const { actor } = await requireCommunityPermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const db = tenantDb(event, { as: 'operator', actor })

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (row.status === 'cancelled') {
    return { ok: true }
  }

  await db.update(EVENTS_TABLE, id, { status: 'cancelled' }, 'Event not found').catch((error) => {
    throw toH3Error(error, 'Could not cancel event')
  })

  return { ok: true }
})
