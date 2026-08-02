import { lessonEditSchema } from '../../../schemas/course'
import { LESSONS_TABLE, type LessonRow } from '../../../shared/types/course'

/**
 * Lektion bearbeiten/publishen (courses.manage) — lessonCount folgt dem
 * Status. Datentür als Operator: get/update belegen die Zugehörigkeit; die
 * Lektion eines fremden Mandanten ergibt 404.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate. Der
 * lessonCount-Nachzug (syncLessonCount) bleibt bewusst Operator: das ist ein
 * abgeleiteter Zähler, kein eigener Schreibvorgang eines Menschen.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const { actor } = await requireCommunityPermission(event, 'courses.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  const body = await readValidatedBody(event, lessonEditSchema.parse)
  const db = tenantDb(event, { as: 'operator', actor })

  const row = await db.get<LessonRow>(LESSONS_TABLE, id, 'Lesson not found')

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.content !== undefined) data.content = body.content
  if (body.videoUrl !== undefined) data.videoUrl = body.videoUrl
  if (body.status !== undefined) data.status = body.status

  const updated = await db.update<LessonRow>(LESSONS_TABLE, id, data, 'Lesson not found').catch((error) => {
    throw toH3Error(error, 'Could not update lesson')
  })

  if (body.status !== undefined && body.status !== row.status) {
    await syncLessonCount(event, row.courseId)
  }

  return updated
})
