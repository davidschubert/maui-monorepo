import type { EventRow } from '../../../../../../packages/events/shared/types/event'

/**
 * Ticket-Checkout für paid-Events — APP-Route (A14: die App komponiert
 * events + billing, die Layer kennen sich nicht). Validiert das Event,
 * erzeugt die One-time-Checkout-Session (billing-Utility
 * createPaymentCheckoutSession) mit metadata.eventId — der Webhook-
 * Fulfiller (billing-fulfillment-Plugin) stellt danach das Ticket über
 * grantEventTicket aus. hasEventTicket/grantEventTicket kommen per
 * Auto-Import aus dem events-Layer (App darf beide kennen).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.getRow<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'events',
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Event not found') })

  if (row.status !== 'published' || (row.access ?? 'free') !== 'paid' || !row.priceLookupKey) {
    throw createError({ status: 409, statusText: 'Event is not purchasable' })
  }
  if (await hasEventTicket(event, id, user.$id)) {
    throw createError({ status: 409, statusText: 'Ticket already owned' })
  }

  const origin = getRequestURL(event).origin
  const localePrefix = typeof getQuery(event).locale === 'string' && getQuery(event).locale === 'de' ? '/de' : ''
  const url = await createPaymentCheckoutSession(event, {
    lookupKey: row.priceLookupKey,
    metadata: { eventId: id },
    successUrl: `${origin}${localePrefix}/events/${id}?ticket=success`,
    cancelUrl: `${origin}${localePrefix}/events/${id}`,
  })

  return { url }
})
