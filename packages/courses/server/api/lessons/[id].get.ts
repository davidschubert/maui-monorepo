import type { LessonRow } from '../../../shared/types/course'

/**
 * Lektions-CONTENT: nur nach Enrollment + Access-Check (paid → App-Guard).
 * Titel-Listen liefert die Kurs-Übersicht; der Inhalt bleibt hinter dem Tor.
 *
 * Datentür als Operator (publishedLessonWithCourse): Lektionen tragen bewusst
 * KEINE Read-Permission, der Admin-Client umgeht sie — die Tür ist hier die
 * einzige Mandanten-Grenze und belegt die Zugehörigkeit VOR der Ausgabe.
 */
export default defineEventHandler(async (event): Promise<LessonRow & { courseSlug: string }> => {
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

  const { lesson, course } = await publishedLessonWithCourse(event, id)
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
