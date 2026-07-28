import type { TicketRow } from '../../../../shared/types/ticket'

/**
 * KI-Triage on demand (Button im Ticket-Modal) — Plan P3.
 *
 * AUTORISIERUNG (Audit-Befund S10c): der Gate steht HIER, in der Route.
 * Er steckte bisher ausschließlich in `triageTicket()` (server/utils) — die
 * Route selbst war eine ungeprüfte Weiterleitung. Das ist kein Loch, aber
 * eine Falle: wer das Util refactort, splittet oder einen zweiten Aufrufer
 * bedient, öffnet still einen Mutations-Endpunkt, der pro Aufruf ein
 * KI-Modell bezahlt und die Ticket-Beschreibung überschreibt. Eine Route
 * ist die Tür — die Tür trägt das Schloss.
 *
 * Im Util bleibt die Prüfung ZUSÄTZLICH stehen (doppelt ist hier richtig:
 * sie kostet nichts und deckt künftige Aufrufer ab).
 */
export default defineEventHandler(async (event): Promise<TicketRow> => {
  requirePermission(event, 'tickets.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })
  return await triageTicket(event, id)
})
