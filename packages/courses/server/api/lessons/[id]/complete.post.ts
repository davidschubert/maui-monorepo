import { Query } from 'node-appwrite'
import { ENROLLMENTS_TABLE, LESSON_PROGRESS_TABLE, LESSONS_TABLE, type LessonProgressRow, type LessonRow } from '../../../../shared/types/course'

/**
 * Lektion abschließen: Progress-Upsert (Unique lessonId+userId) — sind ALLE
 * published-Lektionen des Kurses abgeschlossen (drafts zählen NICHT), setzt
 * der Server enrollment.completedAt autoritativ + recordActivity
 * 'course.completed'.
 *
 * Datentür als Operator: Lektionen/Progress/Enrollments tragen bewusst keine
 * breiten Rechte — die Tür belegt die Zugehörigkeit und stempelt den
 * Mandanten auf die Fortschritts-Zeile.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  const db = tenantDb(event, { as: 'operator' })
  const { course } = await publishedLessonWithCourse(event, id)

  const enrollment = await enrollmentFor(event, course.$id, user.$id)
  if (!enrollment) {
    throw createError({ status: 403, statusText: 'Enroll first' })
  }
  await assertCourseAccess(event, course)

  try {
    await db.create(LESSON_PROGRESS_TABLE, {
      lessonId: id, courseId: course.$id, userId: user.$id, completedAt: new Date().toISOString(),
    }, {
      permissions: ownRowRead(user.$id),
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
    db.list<LessonRow>(LESSONS_TABLE, [
      Query.equal('courseId', course.$id), Query.equal('status', 'published'), Query.limit(500),
    ]),
    db.list<LessonProgressRow>(LESSON_PROGRESS_TABLE, [
      Query.equal('courseId', course.$id), Query.equal('userId', user.$id), Query.limit(500),
    ]),
  ])
  const done = new Set(progress.rows.map(p => p.lessonId))
  const allDone = published.rows.length > 0 && published.rows.every(l => done.has(l.$id))

  if (allDone && !enrollment.completedAt) {
    await db.update(ENROLLMENTS_TABLE, enrollment.$id, {
      completedAt: new Date().toISOString(),
    }, 'Enrollment not found')
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
