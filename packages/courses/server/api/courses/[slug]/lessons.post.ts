import { ID, Query } from 'node-appwrite'
import { lessonSchema } from '../../../../schemas/course'
import { COURSES_TABLE, LESSONS_TABLE, type CourseRow, type LessonRow } from '../../../../shared/types/course'

/** Lektion anlegen (courses.manage; [slug]-Segment = Kurs-Row-ID). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'courses.manage')

  const courseId = getRouterParam(event, 'slug')
  if (!courseId) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const body = await readValidatedBody(event, lessonSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  await admin.tablesDB.getRow<CourseRow>({ databaseId, tableId: COURSES_TABLE, rowId: courseId })
    .catch((error) => { throw toH3Error(error, 'Course not found') })

  // ans Ende sortieren
  const last = await admin.tablesDB.listRows<LessonRow>({
    databaseId, tableId: LESSONS_TABLE,
    queries: [Query.equal('courseId', courseId), Query.orderDesc('order'), Query.limit(1)],
  })
  const order = (last.rows[0]?.order ?? -1) + 1

  const status = body.status ?? 'draft'
  const row = await admin.tablesDB.createRow<LessonRow>({
    databaseId,
    tableId: LESSONS_TABLE,
    rowId: ID.unique(),
    data: { courseId, title: body.title, order, content: body.content, videoUrl: body.videoUrl ?? null, status },
    // Content bleibt hinter der API (Enrollment-Gate) — keine Row-Reads
    permissions: [],
  }).catch((error) => {
    throw toH3Error(error, 'Could not create lesson')
  })

  await syncLessonCount(event, courseId)

  setResponseStatus(event, 201)
  return row
})
