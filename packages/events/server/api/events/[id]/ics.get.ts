import { EVENTS_TABLE, type EventRow } from '../../../../shared/types/event'

/**
 * ICS-Export (text/calendar, EIN VEVENT) — kein externer Dienst. Liest über
 * die Datentür (member/Session): nur Events, die der Aufrufer ohnehin sehen
 * darf (published/cancelled via read(any); drafts → 404; fremde Mandanten → 404).
 */
export default defineEventHandler(async (event): Promise<string> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const row = await tenantDb(event).get<EventRow>(EVENTS_TABLE, id, 'Event not found')

  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="event-${row.$id}.ics"`)
  return buildEventIcs(row)
})
