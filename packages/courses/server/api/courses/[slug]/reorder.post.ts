import { Query } from 'node-appwrite'
import { reorderSchema } from '../../../../schemas/course'
import { LESSONS_TABLE, type LessonRow } from '../../../../shared/types/course'

/**
 * Lektionen umsortieren (courses.manage): lessonIds in Zielreihenfolge.
 * Datentür als Operator — die gescopte Liste ist zugleich die Erlaubnisliste:
 * umsortiert wird NUR, was zu diesem Kurs UND diesem Mandanten gehört.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  await requireSitePermission(event, 'courses.manage')

  const courseId = getRouterParam(event, 'slug')
  if (!courseId) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const { lessonIds } = await readValidatedBody(event, reorderSchema.parse)
  const db = tenantDb(event, { as: 'operator' })

  // nur Lektionen DIESES Kurses umsortieren (fremde Ids ignorieren)
  const lessons = await db.list<LessonRow>(LESSONS_TABLE, [
    Query.equal('courseId', courseId), Query.limit(500),
  ])
  const own = new Set(lessons.rows.map(l => l.$id))

  let order = 0
  for (const lessonId of lessonIds) {
    if (!own.has(lessonId)) continue
    await db.update(LESSONS_TABLE, lessonId, { order }, 'Lesson not found')
    order++
  }

  return { ok: true }
})
