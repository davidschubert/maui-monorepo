import { LESSONS_TABLE, type LessonRow } from '../../../shared/types/course'

/**
 * Lektion löschen (courses.manage) — lessonCount wird nachgezogen. Datentür
 * als Operator: get/remove belegen die Zugehörigkeit VOR dem Löschen.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  await requireSitePermission(event, 'courses.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  const db = tenantDb(event, { as: 'operator' })
  const row = await db.get<LessonRow>(LESSONS_TABLE, id, 'Lesson not found')

  await db.remove(LESSONS_TABLE, id, 'Lesson not found').catch((error) => {
    throw toH3Error(error, 'Could not delete lesson')
  })

  await syncLessonCount(event, row.courseId)

  return { ok: true }
})
