import { Query } from 'node-appwrite'
import { EVENT_RSVPS_TABLE, EVENTS_TABLE, type EventDetailResponse, type EventRow, type EventRsvpRow } from '../../../shared/types/event'

/** Top-N Zusager für den Avatar-Stack der Landing Page */
const ATTENDEE_PREVIEW = 5

/**
 * Event-Detail: published/cancelled sind über die Row-Permission read(any)
 * öffentlich lesbar; drafts liefern 404 (Session-Client sieht sie nicht).
 * Angereichert um die eigene RSVP, den Avatar-Stack der Zusager und den
 * Organizer-Avatar (resolveAvatars — EIN gebündelter users-Query).
 */
export default defineEventHandler(async (event): Promise<EventDetailResponse> => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)

  const row = await tablesDB.getRow<EventRow>({
    databaseId,
    tableId: EVENTS_TABLE,
    rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Event not found')
  })

  const userId = event.context.user?.$id ?? null
  const admin = createAdminClient(event)

  const [rsvps, goingPreview] = await Promise.all([
    myRsvpsFor(event, [row.$id], userId),
    admin.tablesDB.listRows<EventRsvpRow>({
      databaseId,
      tableId: EVENT_RSVPS_TABLE,
      queries: [
        Query.equal('eventId', id),
        Query.equal('status', 'going'),
        Query.orderAsc('$createdAt'),
        Query.limit(ATTENDEE_PREVIEW),
      ],
    }).catch(() => ({ rows: [] as EventRsvpRow[] })),
  ])

  const avatars = await resolveAvatars(event, [
    row.organizerId,
    ...goingPreview.rows.map(r => r.userId),
  ])

  return {
    ...row,
    myRsvp: rsvps.get(row.$id) ?? null,
    attendeePreview: goingPreview.rows.map(r => ({
      userId: r.userId,
      avatarUrl: avatars.get(r.userId) ?? null,
    })),
    organizerAvatarUrl: avatars.get(row.organizerId) ?? null,
  }
})
