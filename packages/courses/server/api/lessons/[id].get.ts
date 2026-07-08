import { COURSES_TABLE, LESSONS_TABLE, type CourseRow, type LessonRow } from '../../../shared/types/course'

/**
 * Lektions-CONTENT: nur nach Enrollment + Access-Check (paid → App-Guard).
 * Titel-Listen liefert die Kurs-Übersicht; der Inhalt bleibt hinter dem Tor.
 */
export default defineEventHandler(async (event): Promise<LessonRow & { courseSlug: string }> => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const lesson = await admin.tablesDB.getRow<LessonRow>({ databaseId, tableId: LESSONS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Lesson not found') })
  if (lesson.status !== 'published') {
    throw createError({ status: 404, statusText: 'Lesson not found' })
  }

  const course = await admin.tablesDB.getRow<CourseRow>({ databaseId, tableId: COURSES_TABLE, rowId: lesson.courseId })
    .catch((error) => { throw toH3Error(error, 'Course not found') })
  if (course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }

  const enrollment = await enrollmentFor(event, course.$id, user.$id)
  if (!enrollment) {
    throw createError({ status: 403, statusText: 'Enroll first' })
  }
  await assertCourseAccess(event, course)

  return { ...lesson, courseSlug: course.slug }
})
