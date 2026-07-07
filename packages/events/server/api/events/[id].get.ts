import { EVENTS_TABLE, type EventRow, type EventWithRsvp } from '../../../shared/types/event'

/**
 * Event-Detail: published/cancelled sind über die Row-Permission read(any)
 * öffentlich lesbar; drafts liefern 404 (Session-Client sieht sie nicht).
 * Angereichert um die eigene RSVP.
 */
export default defineEventHandler(async (event): Promise<EventWithRsvp> => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const row = await tablesDB.getRow<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENTS_TABLE,
    rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Event not found')
  })

  const userId = event.context.user?.$id ?? null
  const rsvps = await myRsvpsFor(event, [row.$id], userId)

  return { ...row, myRsvp: rsvps.get(row.$id) ?? null }
})
