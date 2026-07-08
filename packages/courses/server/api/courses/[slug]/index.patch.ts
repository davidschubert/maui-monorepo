import { courseEditSchema } from '../../../../schemas/course'
import { COURSES_TABLE, type CourseRow } from '../../../../shared/types/course'

/**
 * Kurs bearbeiten (courses.manage; [slug]-Segment = Row-ID im Builder).
 * publish setzt read(users) + recordActivity; draft/archived entziehen es.
 */
export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'courses.manage')

  const id = getRouterParam(event, 'slug')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const body = await readValidatedBody(event, courseEditSchema.parse)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<CourseRow>({ databaseId, tableId: COURSES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Course not found') })

  // paid braucht das Entitlement-Feature — gegen den MERGED Zustand
  const mergedAccess = body.access ?? row.access
  const mergedFeature = body.entitlementFeature === undefined ? row.entitlementFeature : body.entitlementFeature
  if (mergedAccess === 'paid' && !mergedFeature) {
    throw createError({ status: 422, statusText: 'Paid courses need an entitlement feature' })
  }

  const publishing = body.status === 'published' && row.status !== 'published'
  const unpublishing = body.status !== undefined && body.status !== 'published' && row.status === 'published'

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.slug !== undefined) data.slug = body.slug
  if (body.description !== undefined) data.description = body.description
  if (body.access !== undefined) data.access = body.access
  if (body.entitlementFeature !== undefined) data.entitlementFeature = mergedAccess === 'paid' ? body.entitlementFeature : null
  if (body.status !== undefined) data.status = body.status

  const updated = await admin.tablesDB.updateRow<CourseRow>({
    databaseId,
    tableId: COURSES_TABLE,
    rowId: id,
    data,
    ...(publishing ? { permissions: [...new Set([...row.$permissions, COURSE_READ_USERS])] } : {}),
    ...(unpublishing ? { permissions: row.$permissions.filter(p => p !== COURSE_READ_USERS) } : {}),
  }).catch((error) => {
    throw toH3Error(error, 'Could not update course')
  })

  if (publishing) {
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'course.published',
      objectType: 'course',
      objectId: updated.$id,
      link: `/courses/${updated.slug}`,
      metadata: { title: updated.title },
    })
  }

  return updated
})
