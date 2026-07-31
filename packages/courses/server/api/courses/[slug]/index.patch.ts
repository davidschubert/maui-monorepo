import { courseEditSchema } from '../../../../schemas/course'
import { COURSES_TABLE, type CourseRow } from '../../../../shared/types/course'

/**
 * Kurs bearbeiten (courses.manage; [slug]-Segment = Row-ID im Builder).
 * publish setzt read(users) + recordActivity; draft/archived entziehen es.
 * Datentür als Operator: get/update belegen die Zugehörigkeit — ein fremder
 * Mandant bekommt 404. Die Tür trennt Daten- und Permission-Writes bewusst
 * (Muster events/posts): erst update, dann updatePermissions.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const { user } = await requireSitePermission(event, 'courses.manage')

  const id = getRouterParam(event, 'slug')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing course id' })
  }

  const body = await readValidatedBody(event, courseEditSchema.parse)
  const db = tenantDb(event, { as: 'operator' })

  const row = await db.get<CourseRow>(COURSES_TABLE, id, 'Course not found')

  // paid braucht das Entitlement-Produkt — gegen den MERGED Zustand
  const mergedAccess = body.access ?? row.access
  const mergedProduct = body.entitlementProduct === undefined ? row.entitlementProduct : body.entitlementProduct
  if (mergedAccess === 'paid' && !mergedProduct) {
    throw createError({ status: 422, statusText: 'Paid courses need an entitlement product' })
  }

  const publishing = body.status === 'published' && row.status !== 'published'
  const unpublishing = body.status !== undefined && body.status !== 'published' && row.status === 'published'

  const data: Record<string, unknown> = {}
  if (body.title !== undefined) data.title = body.title
  if (body.slug !== undefined) data.slug = body.slug
  if (body.description !== undefined) data.description = body.description
  if (body.access !== undefined) data.access = body.access
  if (body.entitlementProduct !== undefined) data.entitlementProduct = mergedAccess === 'paid' ? body.entitlementProduct : null
  if (body.status !== undefined) data.status = body.status

  const updated = await db.update<CourseRow>(COURSES_TABLE, id, data, 'Course not found').catch((error) => {
    throw toH3Error(error, 'Could not update course')
  })
  // Leserecht folgt dem Status: published = Mitglieder, sonst niemand
  if (publishing) {
    await db.updatePermissions(COURSES_TABLE, id, [...new Set([...row.$permissions, COURSE_READ_USERS])])
      .catch((error) => { throw toH3Error(error, 'Could not update course') })
  }
  if (unpublishing) {
    await db.updatePermissions(COURSES_TABLE, id, row.$permissions.filter(p => p !== COURSE_READ_USERS))
      .catch((error) => { throw toH3Error(error, 'Could not update course') })
  }

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
