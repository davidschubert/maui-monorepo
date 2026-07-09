import type { TicketRow } from '../../../../shared/types/ticket'

/** KI-Triage on demand (Button im Ticket-Modal) — Plan P3. */
export default defineEventHandler(async (event): Promise<TicketRow> => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })
  return await triageTicket(event, id)
})
