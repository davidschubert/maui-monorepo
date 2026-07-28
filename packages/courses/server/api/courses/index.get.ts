import { Query } from 'node-appwrite'
import { COURSES_TABLE, ENROLLMENTS_TABLE, type CourseListResponse, type CourseRow, type EnrollmentRow } from '../../../shared/types/course'

const PAGE_SIZE = 25

/**
 * Kurs-Galerie: published-Kurse für Eingeloggte (Rows tragen read(users) —
 * Kurse sind Mitglieder-Katalog). enrolled-Flag aus EINEM Query (kein N+1).
 *
 * Datentür (member): Session-Client wie bisher — Gäste kommen gar nicht bis
 * hierher (401), Drafts tragen keine Read-Permission — plus Mandanten-Filter
 * im Pool. Die Buchungen liest die Tür als Operator (enrollments haben
 * bewusst keine breite Read-Permission).
 */
export default defineEventHandler(async (event): Promise<CourseListResponse> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten.
  requirePlanProduct(event, 'courses')
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const cursor = getQuery(event).cursor

  const res = await tenantDb(event).list<CourseRow>(COURSES_TABLE, [
    Query.equal('status', 'published'),
    Query.orderDesc('$createdAt'),
    Query.limit(PAGE_SIZE),
    ...(typeof cursor === 'string' && cursor.length > 0 ? [Query.cursorAfter(cursor)] : []),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load courses')
  })

  const ids = res.rows.map(row => row.$id)
  const enrolled = new Set<string>()
  if (ids.length > 0) {
    const enrollments = await tenantDb(event, { as: 'operator' }).list<EnrollmentRow>(ENROLLMENTS_TABLE, [
      Query.equal('userId', user.$id), Query.equal('courseId', ids), Query.limit(ids.length),
    ]).catch(() => ({ rows: [] as EnrollmentRow[] }))
    for (const row of enrollments.rows) enrolled.add(row.courseId)
  }

  return {
    rows: res.rows.map(row => ({ ...row, enrolled: enrolled.has(row.$id) })),
    nextCursor: res.rows.length === PAGE_SIZE ? res.rows.at(-1)!.$id : null,
  }
})
