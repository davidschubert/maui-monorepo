import { Query } from 'node-appwrite'
import { EVENT_RSVPS_TABLE, EVENT_VOTES_TABLE, EVENTS_TABLE, type EventListResponse, type EventRow, type EventRsvpRow, type EventVote, type EventWithRsvp } from '../../../shared/types/event'

const PAGE_SIZE = 25

/** Kalender-/Zeitfenster- und Meine-Filter: begrenzt statt Cursor */
const RANGE_LIMIT = 100
const MAX_RANGE_MS = 62 * 24 * 3600_000
/** Meine-Filter: die JÜNGSTEN 100 RSVPs/Likes werden aufgelöst (Kappung dokumentiert) */
const MINE_IDS_LIMIT = 100

const MINE_FILTERS = ['going', 'liked', 'attended'] as const
type MineFilter = (typeof MINE_FILTERS)[number]

/**
 * Event-Liste: nur published. Drei Modi:
 * - Default = kommende (aufsteigend), ?past=true = Archiv (absteigend),
 *   Cursor-paginiert.
 * - ?from&to (ISO) = Zeitfenster (Kalender-Monatsansicht + Heute/Morgen/
 *   Wochenende-Chips; max. ~2 Monate, Limit 100, ohne Cursor).
 * - ?mine=going|liked|attended (nur eingeloggt): Events mit eigener
 *   going-RSVP (kommend), eigenem Upvote bzw. besuchte (going + vorbei —
 *   der Unterschied zum Archiv: nur MEINE).
 * ?q (Fulltext auf title) kombiniert mit allen Modi.
 * Öffentlich lesbar (Gäste sehen die Liste — RSVP erst nach Login).
 */
export default defineEventHandler(async (event): Promise<EventListResponse> => {
  // Reminder-Sweep on-read (E3, best-effort — wirft nie, kein Cron nötig)
  await sweepEventReminders(event)

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
  const mine = typeof query.mine === 'string' && (MINE_FILTERS as readonly string[]).includes(query.mine)
    ? query.mine as MineFilter
    : null
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const { tablesDB } = createSessionClient(event)
  const now = new Date().toISOString()

  // Meine-Filter: erst die eigenen RSVP-/Vote-Ziel-Ids sammeln (Admin-Client —
  // die Tabellen haben bewusst keine breite Read-Permission)
  let mineIds: string[] | null = null
  if (mine) {
    const user = event.context.user
    if (!user) {
      throw createError({ status: 401, statusText: 'Unauthorized' })
    }
    const admin = createAdminClient(event)
    if (mine === 'liked') {
      const res = await admin.tablesDB.listRows<EventVote>({
        databaseId,
        tableId: EVENT_VOTES_TABLE,
        queries: [Query.equal('userId', user.$id), Query.equal('value', 1), Query.orderDesc('$createdAt'), Query.limit(MINE_IDS_LIMIT)],
      }).catch(() => ({ rows: [] as EventVote[] }))
      mineIds = res.rows.map(r => r.eventId)
    }
    else {
      const res = await admin.tablesDB.listRows<EventRsvpRow>({
        databaseId,
        tableId: EVENT_RSVPS_TABLE,
        queries: [Query.equal('userId', user.$id), Query.equal('status', 'going'), Query.orderDesc('$createdAt'), Query.limit(MINE_IDS_LIMIT)],
      }).catch(() => ({ rows: [] as EventRsvpRow[] }))
      mineIds = res.rows.map(r => r.eventId)
    }
    if (mineIds.length === 0) {
      return { rows: [], nextCursor: null }
    }
  }

  const res = await tablesDB.listRows<EventRow>({
    databaseId,
    tableId: EVENTS_TABLE,
    queries: [
      Query.equal('status', 'published'),
      ...(q.length > 0 ? [Query.search('title', q)] : []),
      ...(mineIds
        ? [
            Query.equal('$id', mineIds),
            // going = kommende Zusagen · attended = besuchte (vorbei) ·
            // liked = zeitlos, neueste zuerst
            ...(mine === 'going' ? [Query.greaterThanEqual('startAt', now), Query.orderAsc('startAt')] : []),
            ...(mine === 'attended' ? [Query.lessThan('startAt', now), Query.orderDesc('startAt')] : []),
            ...(mine === 'liked' ? [Query.orderDesc('startAt')] : []),
            Query.limit(RANGE_LIMIT),
          ]
        : range
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
    nextCursor: !range && !mine && res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
