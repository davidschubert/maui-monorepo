/**
 * Registriert den Ticket-Guard des events-Layers (A14-Komposition: die APP
 * verdrahtet, die Layer kennen sich nicht). Bis Phase 23 ist der Guard der
 * reine Ticket-Row-Check (hasEventTicket) — niemand hat Tickets, paid-Events
 * bleiben effektiv zu. Der Billing-Webhook (Phase 23) stellt Tickets über
 * grantEventTicket() aus; an DIESEM Guard ändert sich dann nichts mehr.
 */
export default defineNitroPlugin(() => {
  registerEventTicketGuard(async (event, row, userId) => hasEventTicket(event, row.$id, userId))
})
