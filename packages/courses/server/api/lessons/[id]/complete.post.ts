import { ID, Permission, Query, Role } from 'node-appwrite'
import { COURSES_TABLE, ENROLLMENTS_TABLE, LESSON_PROGRESS_TABLE, LESSONS_TABLE, type CourseRow, type LessonProgressRow, type LessonRow } from '../../../../shared/types/course'

/**
 * Lektion abschließen: Progress-Upsert (Unique lessonId+userId) — sind ALLE
 * published-Lektionen des Kurses abgeschlossen (drafts zählen NICHT), setzt
 * der Server enrollment.completedAt autoritativ + recordActivity
 * 'course.completed'.
 */
export default defineEventHandler(async (event) => {
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
  const enrollment = await enrollmentFor(event, course.$id, user.$id)
  if (!enrollment) {
    throw createError({ status: 403, statusText: 'Enroll first' })
  }
  await assertCourseAccess(event, course)

  try {
    await admin.tablesDB.createRow({
      databaseId,
      tableId: LESSON_PROGRESS_TABLE,
      rowId: ID.unique(),
      data: { lessonId: id, courseId: course.$id, userId: user.$id, completedAt: new Date().toISOString() },
      permissions: [Permission.read(Role.user(user.$id))],
    })
  }
  catch (error) {
    // Unique-Race/erneuter Abschluss: idempotent
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 409)) {
      throw toH3Error(error, 'Could not save progress')
    }
  }

  // Kurs komplett? published-Lektionen vs. abgeschlossene (drafts zählen nicht)
  const [published, progress] = await Promise.all([
    admin.tablesDB.listRows<LessonRow>({
      databaseId, tableId: LESSONS_TABLE,
      queries: [Query.equal('courseId', course.$id), Query.equal('status', 'published'), Query.limit(500)],
    }),
    admin.tablesDB.listRows<LessonProgressRow>({
      databaseId, tableId: LESSON_PROGRESS_TABLE,
      queries: [Query.equal('courseId', course.$id), Query.equal('userId', user.$id), Query.limit(500)],
    }),
  ])
  const done = new Set(progress.rows.map(p => p.lessonId))
  const allDone = published.rows.length > 0 && published.rows.every(l => done.has(l.$id))

  if (allDone && !enrollment.completedAt) {
    await admin.tablesDB.updateRow({
      databaseId, tableId: ENROLLMENTS_TABLE, rowId: enrollment.$id,
      data: { completedAt: new Date().toISOString() },
    })
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'course.completed',
      objectType: 'course',
      objectId: course.$id,
      link: `/courses/${course.slug}`,
      metadata: { title: course.title },
    })
  }

  return {
    completedLessonIds: [...done, id].filter((v, i, arr) => arr.indexOf(v) === i),
    courseCompleted: allDone,
    total: published.rows.length,
  }
})
