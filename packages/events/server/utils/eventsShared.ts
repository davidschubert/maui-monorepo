import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENT_RSVPS_TABLE, type EventRsvpRow, type RsvpStatus } from '../../shared/types/event'

/** read("any") — published/cancelled-Events tragen sie; drafts nicht */
export const EVENT_READ_ANY = Permission.read(Role.any())

/**
 * Eigene RSVPs des Users zu einer Event-Seite — EIN Query (kein N+1,
 * Muster comment-/poll-Votes). Admin-Client: event_rsvps haben bewusst
 * keine breite Read-Permission.
 */
export async function myRsvpsFor(
  event: H3Event,
  eventIds: string[],
  userId: string | null,
): Promise<Map<string, RsvpStatus>> {
  const map = new Map<string, RsvpStatus>()
  if (!userId || eventIds.length === 0) return map

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<EventRsvpRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENT_RSVPS_TABLE,
    queries: [
      Query.equal('userId', userId),
      Query.equal('eventId', eventIds),
      Query.limit(eventIds.length),
    ],
  }).catch(() => ({ rows: [] as EventRsvpRow[] }))

  for (const row of res.rows) map.set(row.eventId, row.status)
  return map
}
