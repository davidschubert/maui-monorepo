import { Query } from 'node-appwrite'
import { COURSES_TABLE, ENROLLMENTS_TABLE, type CourseRow } from '../../../../shared/types/course'

/**
 * Einschreiben (per Slug): free/members = eingeloggt; paid = App-Guard
 * (assertCourseAccess, fail-closed — im Pool heute IMMER zu, siehe
 * courseAccess.ts). Unique-Index macht Doppel-Enrolls idempotent.
 *
 * Datentür als Operator: enrollments tragen bewusst keine User-Schreibrechte;
 * find/create scopen bzw. stempeln den Mandanten — der Slug eines Nachbarn
 * ist hier schlicht nicht auffindbar (404).
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  // `actor: 'member'` (Audit-Befund 2026-08-01): die Klinke ist Technik
  // (enrollments tragen bewusst keine User-Schreibrechte), eingeschrieben hat
  // sich ein Mitglied. Die M13-Sperre nennt „Kursfortschritt" ausdrücklich.
  const db = tenantDb(event, { as: 'operator', actor: 'member' })

  const course = await db.find<CourseRow>(COURSES_TABLE, [Query.equal('slug', slug)])
  if (!course || course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }

  await assertCourseAccess(event, course)

  try {
    await db.create(ENROLLMENTS_TABLE, {
      courseId: course.$id, userId: user.$id, completedAt: null,
    }, {
      permissions: ownRowRead(user.$id),
    })
  }
  catch (error) {
    // Unique-Race/Doppel-Enroll: idempotent — der bestehende Stand zählt
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 409)) {
      throw toH3Error(error, 'Could not enroll')
    }
  }

  setResponseStatus(event, 201)
  return { ok: true }
})
