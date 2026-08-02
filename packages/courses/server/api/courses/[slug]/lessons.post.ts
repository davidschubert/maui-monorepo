import { Query } from 'node-appwrite'
import { lessonSchema } from '../../../../schemas/course'
import { COURSES_TABLE, LESSONS_TABLE, type CourseRow, type LessonRow } from '../../../../shared/types/course'

/**
 * Lektion anlegen (courses.manage; [slug]-Segment = Kurs-Row-ID). Datentür als
 * Operator: get belegt die Zugehörigkeit des Kurses VOR dem Anlegen, create
 * stempelt den Mandanten auch auf die Lektion.
 *
 * WER HANDELT (F17): Redaktion an INHALT — `actor` aus dem Gate (Rolle ⇒
 * 'member' mit Inhalts-Sperre M13 und Beitritt A5; Break-Glass ⇒ 'operator').
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const { actor } = await requireCommunityPermission(event, 'courses.manage')

  const courseId = getRouterParam(event, 'slug')
  if (!courseId) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const body = await readValidatedBody(event, lessonSchema.parse)
  const db = tenantDb(event, { as: 'operator', actor })

  await db.get<CourseRow>(COURSES_TABLE, courseId, 'Course not found')

  // ans Ende sortieren
  const last = await db.find<LessonRow>(LESSONS_TABLE, [
    Query.equal('courseId', courseId), Query.orderDesc('order'),
  ])
  const order = (last?.order ?? -1) + 1

  const status = body.status ?? 'draft'
  const row = await db.create<LessonRow>(LESSONS_TABLE, {
    courseId, title: body.title, order, content: body.content, videoUrl: body.videoUrl ?? null, status,
  }, {
    // Content bleibt hinter der API (Enrollment-Gate) — keine Row-Reads
    permissions: [],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create lesson')
  })

  await syncLessonCount(event, courseId)

  setResponseStatus(event, 201)
  return row
})
