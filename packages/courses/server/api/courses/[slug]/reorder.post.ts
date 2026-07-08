import { Query } from 'node-appwrite'
import { reorderSchema } from '../../../../schemas/course'
import { LESSONS_TABLE, type LessonRow } from '../../../../shared/types/course'

/** Lektionen umsortieren (courses.manage): lessonIds in Zielreihenfolge. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'courses.manage')

  const courseId = getRouterParam(event, 'slug')
  if (!courseId) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const { lessonIds } = await readValidatedBody(event, reorderSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  // nur Lektionen DIESES Kurses umsortieren (fremde Ids ignorieren)
  const lessons = await admin.tablesDB.listRows<LessonRow>({
    databaseId, tableId: LESSONS_TABLE,
    queries: [Query.equal('courseId', courseId), Query.limit(500)],
  })
  const own = new Set(lessons.rows.map(l => l.$id))

  let order = 0
  for (const lessonId of lessonIds) {
    if (!own.has(lessonId)) continue
    await admin.tablesDB.updateRow({ databaseId, tableId: LESSONS_TABLE, rowId: lessonId, data: { order } })
    order++
  }

  return { ok: true }
})
