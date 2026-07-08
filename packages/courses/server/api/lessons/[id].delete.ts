import { LESSONS_TABLE, type LessonRow } from '../../../shared/types/course'

/** Lektion löschen (courses.manage) — lessonCount wird nachgezogen. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'courses.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<LessonRow>({ databaseId, tableId: LESSONS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Lesson not found') })

  await admin.tablesDB.deleteRow({ databaseId, tableId: LESSONS_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Could not delete lesson') })

  await syncLessonCount(event, row.courseId)

  return { ok: true }
})
