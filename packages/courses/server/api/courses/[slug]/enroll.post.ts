import { ID, Permission, Query, Role } from 'node-appwrite'
import { COURSES_TABLE, ENROLLMENTS_TABLE, type CourseRow } from '../../../../shared/types/course'

/**
 * Einschreiben (per Slug): free/members = eingeloggt; paid = App-Guard
 * (assertCourseAccess, fail-closed). Unique-Index macht Doppel-Enrolls
 * idempotent.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const courses = await admin.tablesDB.listRows<CourseRow>({
    databaseId,
    tableId: COURSES_TABLE,
    queries: [Query.equal('slug', slug), Query.limit(1)],
  })
  const course = courses.rows[0]
  if (!course || course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }

  await assertCourseAccess(event, course)

  try {
    await admin.tablesDB.createRow({
      databaseId,
      tableId: ENROLLMENTS_TABLE,
      rowId: ID.unique(),
      data: { courseId: course.$id, userId: user.$id, completedAt: null },
      permissions: [Permission.read(Role.user(user.$id))],
    })
  }
  catch (error) {
    // Unique-Race/Doppel-Enroll: idempotent — der bestehende Stand zählt
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 409)) {
      throw toH3Error(error, 'Could not enroll')
    }
  }

  setResponseStatus(event, 201)
  return { ok: true }
})
