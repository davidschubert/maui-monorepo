import { Query } from 'node-appwrite'
import { COURSES_TABLE, LESSON_PROGRESS_TABLE, LESSONS_TABLE, type CourseDetailResponse, type CourseRow, type LessonProgressRow, type LessonRow } from '../../../shared/types/course'

/**
 * Kurs-Übersicht (per Slug): Detail + Lektions-TITEL (published) für
 * Eingeloggte — Lektions-CONTENT liefert erst GET /api/lessons/:id nach
 * Enrollment + Access-Check. Fortschritt des Users kommt mit.
 *
 * Datentür: der Kurs über die member-Tür (Session-Client wie bisher, plus
 * Mandanten-Filter — der Slug eines Nachbarn ist im Pool nicht auffindbar),
 * Lektionen/Fortschritt als Operator (beide tragen bewusst keine breite
 * Read-Permission).
 */
export default defineEventHandler(async (event): Promise<CourseDetailResponse> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  const course = await tenantDb(event).find<CourseRow>(COURSES_TABLE, [Query.equal('slug', slug)])
    .catch((error) => { throw toH3Error(error, 'Course not found') })
  if (!course || course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }

  const ops = tenantDb(event, { as: 'operator' })
  const [lessons, enrollment, progress] = await Promise.all([
    ops.list<LessonRow>(LESSONS_TABLE, [
      Query.equal('courseId', course.$id), Query.equal('status', 'published'), Query.orderAsc('order'), Query.limit(500),
    ]),
    enrollmentFor(event, course.$id, user.$id),
    ops.list<LessonProgressRow>(LESSON_PROGRESS_TABLE, [
      Query.equal('courseId', course.$id), Query.equal('userId', user.$id), Query.limit(500),
    ]).catch(() => ({ rows: [] as LessonProgressRow[] })),
  ])

  return {
    ...course,
    lessons: lessons.rows.map(l => ({ $id: l.$id, title: l.title, order: l.order, status: l.status })),
    enrolled: enrollment !== null,
    completedLessonIds: progress.rows.map(p => p.lessonId),
    completedAt: enrollment?.completedAt ?? null,
  }
})
