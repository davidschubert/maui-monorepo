import { Query } from 'node-appwrite'
import { ACTIVITIES_TABLE, type Activity, type ActivityListResponse } from '../../../shared/types/activity'

const PAGE_SIZE = 25

/**
 * Activity-Feed, chronologisch absteigend, Cursor-paginiert. Session Pflicht —
 * die Rows tragen read(users) (recordActivity), gelesen wird über den
 * SessionClient, damit die Row-Security die Autorität bleibt (A3).
 */
export default defineEventHandler(async (event): Promise<ActivityListResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const cursor = getQuery(event).cursor
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const res = await tablesDB.listRows<Activity>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: ACTIVITIES_TABLE,
    queries: [
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
    ],
  }).catch((error) => {
    // Ungültiger Cursor / abgelaufene Session als 4xx durchreichen, nicht als 500
    throw toH3Error(error, 'Could not load activity feed')
  })

  // Actor-Avatare aus den Account-prefs anreichern (gebündelt, wie comments)
  const avatars = await resolveAvatars(event, res.rows.map(row => row.actorId))
  const rows = res.rows.map(row => ({ ...row, actorAvatarUrl: avatars.get(row.actorId) }))

  return {
    rows,
    nextCursor: res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
