import { EVENTS_TABLE, type EventDetailResponse, type EventRow } from '../../../shared/types/event'

/**
 * Event-Detail: published/cancelled sind über die Row-Permission read(any)
 * öffentlich lesbar; drafts liefern 404 (Session-Client sieht sie nicht).
 * Angereichert um eigene RSVP + eigenen Vote, die Teilnehmerliste
 * (PRIVACY-GATE: Namen/Avatare nur für Eingeloggte — Gäste sehen die
 * Anzahl, die UI rendert Platzhalter) und den Organizer-Avatar.
 */
export default defineEventHandler(async (event): Promise<EventDetailResponse> => {
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

  const [rsvps, votes, attendees, avatars] = await Promise.all([
    myRsvpsFor(event, [row.$id], userId),
    myVotesFor(event, [row.$id], userId),
    attendeesFor(event, row.$id, userId),
    resolveAvatars(event, [row.organizerId]),
  ])

  return {
    ...row,
    myRsvp: rsvps.get(row.$id) ?? null,
    myVote: votes.get(row.$id) ?? null,
    attendeeAvatars: attendees.map(a => a.avatarUrl),
    attendees,
    organizerAvatarUrl: avatars.get(row.organizerId) ?? null,
  }
})
