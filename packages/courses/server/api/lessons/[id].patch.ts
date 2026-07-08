import { lessonEditSchema } from '../../../schemas/course'
import { LESSONS_TABLE, type LessonRow } from '../../../shared/types/course'

/** Lektion bearbeiten/publishen (courses.manage) — lessonCount folgt dem Status. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'courses.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  const body = await readValidatedBody(event, lessonEditSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<LessonRow>({ databaseId, tableId: LESSONS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Lesson not found') })

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.content !== undefined) data.content = body.content
  if (body.videoUrl !== undefined) data.videoUrl = body.videoUrl
  if (body.status !== undefined) data.status = body.status

  const updated = await admin.tablesDB.updateRow<LessonRow>({
    databaseId, tableId: LESSONS_TABLE, rowId: id, data,
  }).catch((error) => {
    throw toH3Error(error, 'Could not update lesson')
  })

  if (body.status !== undefined && body.status !== row.status) {
    await syncLessonCount(event, row.courseId)
  }

  return updated
})
