import { Query } from 'node-appwrite'
import { COURSES_TABLE, ENROLLMENTS_TABLE, type CourseListResponse, type CourseRow, type EnrollmentRow } from '../../../shared/types/course'

const PAGE_SIZE = 25

/**
 * Kurs-Galerie: published-Kurse für Eingeloggte (Rows tragen read(users) —
 * Kurse sind Mitglieder-Katalog). enrolled-Flag aus EINEM Query (kein N+1).
 */
export default defineEventHandler(async (event): Promise<CourseListResponse> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const cursor = getQuery(event).cursor
  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const res = await tablesDB.listRows<CourseRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COURSES_TABLE,
    queries: [
      Query.equal('status', 'published'),
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
    ],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load courses')
  })

  const ids = res.rows.map(row => row.$id)
  const enrolled = new Set<string>()
  if (ids.length > 0) {
    const admin = createAdminClient(event)
    const enrollments = await admin.tablesDB.listRows<EnrollmentRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: ENROLLMENTS_TABLE,
      queries: [Query.equal('userId', user.$id), Query.equal('courseId', ids), Query.limit(ids.length)],
    }).catch(() => ({ rows: [] as EnrollmentRow[] }))
    for (const row of enrollments.rows) enrolled.add(row.courseId)
  }

  return {
    rows: res.rows.map(row => ({ ...row, enrolled: enrolled.has(row.$id) })),
    nextCursor: res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
