import { Query } from 'node-appwrite'
import { ACTIVITIES_TABLE, type Activity, type ActivityListResponse } from '../../../shared/types/activity'

const PAGE_SIZE = 25

/**
 * Activity-Feed, chronologisch absteigend, Cursor-paginiert. Session Pflicht —
 * die Rows tragen den Mitglieder-Read (recordActivity), gelesen wird über die
 * MITGLIEDER-Klinke der Datentür (Session-Client), damit die Row-Security die
 * Autorität bleibt (A3) und der Mandanten-Filter das Netz darunter (C1b).
 * Kein `as:'operator'`: hier gibt es nichts zu sehen, was der Session-Client
 * nicht sehen dürfte.
 */
export default defineEventHandler(async (event): Promise<ActivityListResponse> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const cursor = getQuery(event).cursor

  const res = await tenantDb(event).list<Activity>(ACTIVITIES_TABLE, [
    Query.orderDesc('$createdAt'),
    Query.limit(PAGE_SIZE),
    ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
  ]).catch((error) => {
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
