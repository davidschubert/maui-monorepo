/**
 * A14-Komposition: verbindet billing (One-time-Checkout-Fulfillment) mit
 * events (Ticket ausstellen) — die Layer kennen sich nicht, die APP schon.
 * Idempotent (grantEventTicket upsertet über den Unique-Index) — Webhook-
 * Retries sind gefahrlos.
 */
export default defineNitroPlugin(() => {
  registerCheckoutFulfillment(async (event, session) => {
    const eventId = session.metadata?.eventId
    const userId = session.metadata?.userId ?? session.client_reference_id
    if (!eventId || !userId) return

    await grantEventTicket(event, {
      eventId,
      userId,
      stripeSessionId: session.id,
      amount: session.amount_total ?? undefined,
    })
  })
})
