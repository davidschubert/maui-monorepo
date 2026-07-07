import { Query } from 'node-appwrite'
import { EVENTS_TABLE, type EventListResponse, type EventRow, type EventWithRsvp } from '../../../shared/types/event'

const PAGE_SIZE = 25

/**
 * Event-Liste: nur published, Default = kommende (aufsteigend nach startAt),
 * ?past=true = Archiv (absteigend). Öffentlich lesbar (Gäste sehen die Liste —
 * RSVP erst nach Login). myRsvp des eingeloggten Users aus EINEM Query.
 */
export default defineEventHandler(async (event): Promise<EventListResponse> => {
  const query = getQuery(event)
  const past = query.past === 'true'
  const cursor = query.cursor
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const now = new Date().toISOString()

  const res = await tablesDB.listRows<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENTS_TABLE,
    queries: [
      Query.equal('status', 'published'),
      ...(past
        ? [Query.lessThan('startAt', now), Query.orderDesc('startAt')]
        : [Query.greaterThanEqual('startAt', now), Query.orderAsc('startAt')]),
      Query.limit(PAGE_SIZE),
      ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
    ],
  }).catch((error) => {
    // Ungültiger Cursor / abgelaufene Session als 4xx durchreichen, nicht als 500
    throw toH3Error(error, 'Could not load events')
  })

  const userId = event.context.user?.$id ?? null
  const rsvps = await myRsvpsFor(event, res.rows.map(row => row.$id), userId)

  const rows: EventWithRsvp[] = res.rows.map(row => ({
    ...row,
    myRsvp: rsvps.get(row.$id) ?? null,
  }))

  return {
    rows,
    nextCursor: res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
