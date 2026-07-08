import { Query } from 'node-appwrite'
import { COURSES_TABLE, LESSONS_TABLE, type CourseRow, type LessonRow } from '../../../../shared/types/course'

/** Builder-Detail (courses.manage): Kurs (per Id!) + ALLE Lektionen inkl. Content. */
export default defineEventHandler(async (event): Promise<CourseRow & { lessons: LessonRow[] }> => {
  requirePermission(event, 'courses.manage')

  // [slug]-Segment trägt hier die Row-ID (Builder navigiert per Id)
  const id = getRouterParam(event, 'slug')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const course = await admin.tablesDB.getRow<CourseRow>({ databaseId, tableId: COURSES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Course not found') })
  const lessons = await admin.tablesDB.listRows<LessonRow>({
    databaseId,
    tableId: LESSONS_TABLE,
    queries: [Query.equal('courseId', id), Query.orderAsc('order'), Query.limit(500)],
  })

  return { ...course, lessons: lessons.rows }
})
