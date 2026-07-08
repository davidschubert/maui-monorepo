import { Query } from 'node-appwrite'
import { EVENTS_TABLE, type EventListResponse, type EventRow, type EventWithRsvp } from '../../../shared/types/event'

const PAGE_SIZE = 25

/** Kalender-Monatsansicht: begrenztes Zeitfenster statt Cursor */
const RANGE_LIMIT = 100
const MAX_RANGE_MS = 62 * 24 * 3600_000

/**
 * Event-Liste: nur published. Zwei Modi:
 * - Default = kommende (aufsteigend), ?past=true = Archiv (absteigend),
 *   Cursor-paginiert.
 * - ?from&to (ISO) = Zeitfenster für die Kalender-Monatsansicht (max. ~2
 *   Monate, Limit 100, ohne Cursor).
 * Öffentlich lesbar (Gäste sehen die Liste — RSVP erst nach Login).
 * myRsvp des eingeloggten Users aus EINEM Query.
 */
export default defineEventHandler(async (event): Promise<EventListResponse> => {
  const query = getQuery(event)
  const past = query.past === 'true'
  const cursor = query.cursor
  // Suche (?q): Fulltext-Index auf title (Migration 003)
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : ''
  const from = typeof query.from === 'string' ? Date.parse(query.from) : Number.NaN
  const to = typeof query.to === 'string' ? Date.parse(query.to) : Number.NaN
  const range = Number.isFinite(from) && Number.isFinite(to)
  if (range && (to <= from || to - from > MAX_RANGE_MS)) {
    throw createError({ status: 400, statusText: 'Invalid range' })
  }
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const now = new Date().toISOString()

  const res = await tablesDB.listRows<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENTS_TABLE,
    queries: [
      Query.equal('status', 'published'),
      ...(q.length > 0 ? [Query.search('title', q)] : []),
      ...(range
        ? [
            Query.greaterThanEqual('startAt', new Date(from).toISOString()),
            Query.lessThan('startAt', new Date(to).toISOString()),
            Query.orderAsc('startAt'),
            Query.limit(RANGE_LIMIT),
          ]
        : [
            ...(past
              ? [Query.lessThan('startAt', now), Query.orderDesc('startAt')]
              : [Query.greaterThanEqual('startAt', now), Query.orderAsc('startAt')]),
            Query.limit(PAGE_SIZE),
            ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
          ]),
    ],
  }).catch((error) => {
    // Ungültiger Cursor / abgelaufene Session als 4xx durchreichen, nicht als 500
    throw toH3Error(error, 'Could not load events')
  })

  const userId = event.context.user?.$id ?? null
  const ids = res.rows.map(row => row.$id)
  const [rsvps, votes, avatars] = await Promise.all([
    myRsvpsFor(event, ids, userId),
    myVotesFor(event, ids, userId),
    attendeeAvatarsFor(event, ids, userId),
  ])

  const rows: EventWithRsvp[] = res.rows.map(row => ({
    ...row,
    myRsvp: rsvps.get(row.$id) ?? null,
    myVote: votes.get(row.$id) ?? null,
    attendeeAvatars: avatars.get(row.$id) ?? [],
  }))

  return {
    rows,
    nextCursor: !range && res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
