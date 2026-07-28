import { Query } from 'node-appwrite'
import { COURSES_TABLE, LESSONS_TABLE, type CourseRow, type LessonRow } from '../../../../shared/types/course'

/**
 * Builder-Detail (courses.manage): Kurs (per Id!) + ALLE Lektionen inkl.
 * Content. Datentür als Operator: get belegt die Zugehörigkeit — der Kurs
 * eines fremden Mandanten ergibt 404, auch mit gültiger Verwaltungs-Rolle
 * auf der EIGENEN Site.
 */
export default defineEventHandler(async (event): Promise<CourseRow & { lessons: LessonRow[] }> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  await requireSitePermission(event, 'courses.manage')

  // [slug]-Segment trägt hier die Row-ID (Builder navigiert per Id)
  const id = getRouterParam(event, 'slug')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const db = tenantDb(event, { as: 'operator' })
  const course = await db.get<CourseRow>(COURSES_TABLE, id, 'Course not found')
  const lessons = await db.list<LessonRow>(LESSONS_TABLE, [
    Query.equal('courseId', id), Query.orderAsc('order'), Query.limit(500),
  ])

  return { ...course, lessons: lessons.rows }
})
