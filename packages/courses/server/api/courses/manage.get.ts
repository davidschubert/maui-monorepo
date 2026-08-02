import { Query } from 'node-appwrite'
import { COURSES_TABLE, type CourseManageResponse, type CourseRow } from '../../../shared/types/course'

/**
 * Builder-Liste (courses.manage): ALLE Status inkl. drafts — deshalb Datentür
 * als Operator (drafts tragen bewusst keine Read-Permission; der Admin-Client
 * umgeht Row-Permissions, die Tür ist hier die einzige Grenze).
 *
 * AUTORISIERUNG: `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 */
export default defineEventHandler(async (event): Promise<CourseManageResponse> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  await requireCommunityPermission(event, 'courses.manage')

  const res = await tenantDb(event, { as: 'operator' }).list<CourseRow>(COURSES_TABLE, [
    Query.orderDesc('$createdAt'), Query.limit(100),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load courses')
  })
  // F13-Muster: das Formular soll 'paid' nur anbieten, wo es auch aufgeht.
  // Die Antwort trägt die Wahrheit mit, statt sie im Client zu erraten.
  return { rows: res.rows, paidAvailable: isCourseAccessConfigured() }
})
