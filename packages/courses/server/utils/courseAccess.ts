import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { ENROLLMENTS_TABLE, LESSONS_TABLE, type CourseRow, type EnrollmentRow, type LessonRow } from '../../shared/types/course'

/** Row-Permission published-Kurse: Mitglieder-Katalog (kein Gast-Content) */
export const COURSE_READ_USERS = Permission.read(Role.users())

/**
 * Access-Guard-Vertrag (A14, Muster registerUserDataContributor): courses
 * kennt billing NICHT — die APP registriert den Guard und ruft darin z. B.
 * billings requireEntitlement auf. OHNE registrierten Guard sind
 * 'paid'-Kurse FAIL-CLOSED (403).
 */
export type CourseAccessGuard = (event: H3Event, course: CourseRow) => Promise<boolean>

let accessGuard: CourseAccessGuard | null = null

export function registerCourseAccessGuard(guard: CourseAccessGuard): void {
  accessGuard = guard
}

/** free/members = eingeloggt genügt · paid = delegiert an den App-Guard */
export async function assertCourseAccess(event: H3Event, course: CourseRow): Promise<void> {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  if (course.access !== 'paid') return
  if (!accessGuard) {
    throw createError({ status: 403, statusText: 'Paid course — access not configured' })
  }
  const allowed = await accessGuard(event, course).catch(() => false)
  if (!allowed) {
    throw createError({ status: 403, statusText: 'Upgrade required' })
  }
}

/** Enrollment des Users für einen Kurs (eine indizierte Query) */
export async function enrollmentFor(event: H3Event, courseId: string, userId: string): Promise<EnrollmentRow | null> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<EnrollmentRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: ENROLLMENTS_TABLE,
    queries: [Query.equal('courseId', courseId), Query.equal('userId', userId), Query.limit(1)],
  }).catch(() => ({ rows: [] as EnrollmentRow[] }))
  return res.rows[0] ?? null
}

/** published-Lektionen eines Kurses zählen (Recount für lessonCount) */
export async function publishedLessonCount(event: H3Event, courseId: string): Promise<number> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<LessonRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: LESSONS_TABLE,
    queries: [Query.equal('courseId', courseId), Query.equal('status', 'published'), Query.limit(1)],
  })
  return res.total
}

/** lessonCount (denormalisiert) autoritativ nachziehen — best-effort */
export async function syncLessonCount(event: H3Event, courseId: string): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const count = await publishedLessonCount(event, courseId)
    await admin.tablesDB.updateRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'courses',
      rowId: courseId,
      data: { lessonCount: count },
    })
  }
  catch (error) {
    console.error(`[courses] lessonCount-Sync für ${courseId} fehlgeschlagen:`, error)
  }
}
