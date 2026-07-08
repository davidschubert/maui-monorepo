import { Query } from 'node-appwrite'
import { COURSES_TABLE, LESSON_PROGRESS_TABLE, LESSONS_TABLE, type CourseDetailResponse, type CourseRow, type LessonProgressRow, type LessonRow } from '../../../shared/types/course'

/**
 * Kurs-Übersicht (per Slug): Detail + Lektions-TITEL (published) für
 * Eingeloggte — Lektions-CONTENT liefert erst GET /api/lessons/:id nach
 * Enrollment + Access-Check. Fortschritt des Users kommt mit.
 */
export default defineEventHandler(async (event): Promise<CourseDetailResponse> => {
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
  const { tablesDB } = createSessionClient(event)

  const courses = await tablesDB.listRows<CourseRow>({
    databaseId,
    tableId: COURSES_TABLE,
    queries: [Query.equal('slug', slug), Query.limit(1)],
  }).catch((error) => { throw toH3Error(error, 'Course not found') })
  const course = courses.rows[0]
  if (!course || course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }

  const admin = createAdminClient(event)
  const [lessons, enrollment, progress] = await Promise.all([
    admin.tablesDB.listRows<LessonRow>({
      databaseId,
      tableId: LESSONS_TABLE,
      queries: [Query.equal('courseId', course.$id), Query.equal('status', 'published'), Query.orderAsc('order'), Query.limit(500)],
    }),
    enrollmentFor(event, course.$id, user.$id),
    admin.tablesDB.listRows<LessonProgressRow>({
      databaseId,
      tableId: LESSON_PROGRESS_TABLE,
      queries: [Query.equal('courseId', course.$id), Query.equal('userId', user.$id), Query.limit(500)],
    }).catch(() => ({ rows: [] as LessonProgressRow[] })),
  ])

  return {
    ...course,
    lessons: lessons.rows.map(l => ({ $id: l.$id, title: l.title, order: l.order, status: l.status })),
    enrolled: enrollment !== null,
    completedLessonIds: progress.rows.map(p => p.lessonId),
    completedAt: enrollment?.completedAt ?? null,
  }
})
