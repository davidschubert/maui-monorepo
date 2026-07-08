import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EVENT_RSVPS_TABLE, EVENT_VOTES_TABLE, type EventAttendee, type EventRsvpRow, type EventVote, type EventVoteValue, type RsvpStatus } from '../../shared/types/event'

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

/** Eigene Up-/Downvotes zu einer Event-Seite — EIN Query (Muster myRsvpsFor) */
export async function myVotesFor(
  event: H3Event,
  eventIds: string[],
  userId: string | null,
): Promise<Map<string, EventVoteValue>> {
  const map = new Map<string, EventVoteValue>()
  if (!userId || eventIds.length === 0) return map

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<EventVote>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENT_VOTES_TABLE,
    queries: [
      Query.equal('userId', userId),
      Query.equal('eventId', eventIds),
      Query.limit(eventIds.length),
    ],
  }).catch(() => ({ rows: [] as EventVote[] }))

  for (const row of res.rows) map.set(row.eventId, row.value)
  return map
}

/** Zusager-Rows für eine Menge Events — gebündelt, defensiv leer */
async function goingRsvpsFor(event: H3Event, eventIds: string[], limit: number): Promise<EventRsvpRow[]> {
  if (eventIds.length === 0) return []
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<EventRsvpRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENT_RSVPS_TABLE,
    queries: [
      Query.equal('eventId', eventIds),
      Query.equal('status', 'going'),
      Query.orderAsc('$createdAt'),
      Query.limit(limit),
    ],
  }).catch(() => ({ rows: [] as EventRsvpRow[] }))
  return res.rows
}

/**
 * Avatar-Vorschau der Zusager je Event für die Cards (Top-N) — PRIVACY-GATE:
 * nur für eingeloggte Betrachter (Gäste sehen die Anzahl, die UI rendert
 * Platzhalter; keine userIds im Payload).
 */
export async function attendeeAvatarsFor(
  event: H3Event,
  eventIds: string[],
  viewerId: string | null,
  perEvent = 3,
): Promise<Map<string, Array<string | null>>> {
  const map = new Map<string, Array<string | null>>()
  if (!viewerId || eventIds.length === 0) return map

  const rows = await goingRsvpsFor(event, eventIds, 100)
  const picked = new Map<string, string[]>()
  for (const row of rows) {
    const list = picked.get(row.eventId) ?? []
    if (list.length < perEvent) picked.set(row.eventId, [...list, row.userId])
  }
  const avatars = await resolveAvatars(event, [...picked.values()].flat())
  for (const [eventId, userIds] of picked) {
    map.set(eventId, userIds.map(id => avatars.get(id) ?? null))
  }
  return map
}

/**
 * Teilnehmerliste (Name + Avatar) für die Detailseite — PRIVACY-GATE wie
 * oben: Gäste bekommen eine LEERE Liste. EIN gebündelter users-Query.
 */
export async function attendeesFor(
  event: H3Event,
  eventId: string,
  viewerId: string | null,
  limit = 12,
): Promise<EventAttendee[]> {
  if (!viewerId) return []

  const rows = await goingRsvpsFor(event, [eventId], limit)
  if (rows.length === 0) return []

  try {
    const admin = createAdminClient(event)
    const res = await admin.users.list({
      queries: [Query.equal('$id', rows.map(r => r.userId)), Query.limit(rows.length)],
    })
    const byId = new Map(res.users.map(u => [u.$id, u]))
    return rows.flatMap((row) => {
      const user = byId.get(row.userId)
      if (!user) return []
      const avatarUrl = (user.prefs as { avatarUrl?: string })?.avatarUrl
      return [{
        userId: user.$id,
        name: user.name,
        avatarUrl: typeof avatarUrl === 'string' && avatarUrl.length > 0 ? avatarUrl : null,
      }]
    })
  }
  catch {
    return []
  }
}

/**
 * Recount+Write pro Event serialisieren (Muster posts/postVoteLock):
 * parallele Votes hinterließen sonst einen Write auf veraltetem Recount.
 * In-memory — reicht für Single-Instanz.
 */
const voteQueues = new Map<string, Promise<unknown>>()

export async function serializePerEvent<T>(eventId: string, fn: () => Promise<T>): Promise<T> {
  const prev = voteQueues.get(eventId) ?? Promise.resolve()
  const run = prev.catch(() => {}).then(fn)
  voteQueues.set(eventId, run)
  try {
    return await run
  }
  finally {
    if (voteQueues.get(eventId) === run) voteQueues.delete(eventId)
  }
}
