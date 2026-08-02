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
 * WER HANDELT (F17) — der EINE strittige Fall der Durchsicht, von David am
 * 2026-08-02 entschieden: **Absagen bleibt OFFEN, auch in einer
 * billing-gesperrten Community.** Deshalb wird `actor` hier bewusst NICHT
 * durchgereicht; die Türklinke bleibt 'operator' und die Inhalts-Sperre
 * greift nicht.
 *
 * Der Grund schlägt die Systematik: eine Absage schützt die ZUSAGENDEN, und
 * die haben mit der offenen Rechnung ihres Owners nichts zu tun. Wer vor
 * verschlossener Tür steht, weil eine Mahnung lief, erfährt nie, dass es an
 * der Rechnung lag — er merkt sich nur, dass hier niemand war.
 *
 * Die Gegenargumente sind damit NICHT verschwunden, sie sind überstimmt, und
 * sie gehören hierher, damit niemand sie neu erfindet: (1) eine Absage ist
 * keine Rücknahme, sondern eine neue Aussage an alle Teilnehmer — die Sorte
 * Schreibvorgang, die die Sperre eigentlich meint; (2) „löschen darf man,
 * anlegen nicht" ist die Art Ausnahme, auf die sich der nächste Weg beruft.
 * Wegen (2) gilt diese Ausnahme AUSSCHLIESSLICH fürs Absagen (hier und in
 * series.delete.ts): sie rechtfertigt keinen weiteren offenen Schreibweg.
 * ANLEGEN und ÄNDERN eines Termins bleiben zu (index.post.ts, [id].patch.ts).
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  await requireCommunityPermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const db = tenantDb(event, { as: 'operator' }) // kein `actor`: Absagen bleibt offen (s. Kopf)

  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (row.status === 'cancelled') {
    return { ok: true }
  }

  await db.update(EVENTS_TABLE, id, { status: 'cancelled' }, 'Event not found').catch((error) => {
    throw toH3Error(error, 'Could not cancel event')
  })

  return { ok: true }
})
