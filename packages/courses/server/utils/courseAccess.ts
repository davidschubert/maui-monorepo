import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { COURSES_TABLE, ENROLLMENTS_TABLE, LESSONS_TABLE, type CourseRow, type EnrollmentRow, type LessonRow } from '../../shared/types/course'

/**
 * Row-Permission published-Kurse: Mitglieder-Katalog (kein Gast-Content).
 *
 * BEWUSST unverändert `Role.users()` — auch im Pool (Muster events
 * EVENT_READ_ANY). Zwei Gründe, beide praktisch:
 *  1. Das Publikum-Helferlein `tenantRowPermissions(event, {read:'members'})`
 *     würde im Pool `Role.label(communityId)` setzen — und dieses Label trägt seit A5
 *     (2026-07-29) genau wer eine Mitgliedschaft MIT ZUGANG hat. Für einen
 *     Kurs-Katalog ist das die falsche Grenze: er soll für alle eingeloggten
 *     Nutzer dieser Community sichtbar sein, auch bevor jemand beigetreten ist
 *     (der Beitritt entsteht ja erst beim ersten eigenen Schreibvorgang). Mit
 *     `label` sähe ein Neuankömmling einen leeren Katalog und hätte keinen
 *     Anlass, jemals etwas zu tun.
 *  2. Die Mandanten-Grenze ist ohnehin die Datentür: `list` filtert auf
 *     tenantId, `get` belegt die Zugehörigkeit VOR der Ausgabe. Die
 *     Row-Permission trennt hier Publikum (eingeloggt vs. Gast), nicht
 *     Mandanten — genau wie read(any) bei Events.
 */
export const COURSE_READ_USERS = Permission.read(Role.users())

/** Eigene Zeile lesbar (Buchung/Fortschritt) — mehr nicht. */
export const ownRowRead = (userId: string): string[] => [Permission.read(Role.user(userId))]

/**
 * Access-Guard-Vertrag (A14, Muster registerUserDataContributor): courses
 * kennt billing NICHT — die APP registriert den Guard und ruft darin z. B.
 * billings requireEntitlement auf. OHNE registrierten Guard sind
 * 'paid'-Kurse FAIL-CLOSED (403).
 *
 * POOL-SONDERFALL (dokumentiert + per Test genagelt, Muster events N5b):
 * im Pool registriert HEUTE keine App einen Guard — die platform-App bindet
 * billing nicht ein, und der Stripe-Webhook stempelt keinen Mandanten. Damit
 * sind 'paid'-Kurse im Pool fail-closed (403), genau wie Paid-Events. Erst
 * wenn Billing mandantenfähig ist, darf hier ein Pool-Guard andocken.
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

/**
 * Enrollment des Users für einen Kurs (eine indizierte Query). Datentür als
 * Operator: enrollments tragen bewusst keine breite Read-Permission; im Pool
 * scopet die Tür zusätzlich auf den Mandanten.
 */
export async function enrollmentFor(event: H3Event, courseId: string, userId: string): Promise<EnrollmentRow | null> {
  return tenantDb(event, { as: 'operator' }).find<EnrollmentRow>(ENROLLMENTS_TABLE, [
    Query.equal('courseId', courseId),
    Query.equal('userId', userId),
  ]).catch(() => null)
}

/** published-Lektionen eines Kurses zählen (Recount für lessonCount) */
export async function publishedLessonCount(event: H3Event, courseId: string): Promise<number> {
  return tenantDb(event, { as: 'operator' }).count(LESSONS_TABLE, [
    Query.equal('courseId', courseId),
    Query.equal('status', 'published'),
  ])
}

/** lessonCount (denormalisiert) autoritativ nachziehen — best-effort */
export async function syncLessonCount(event: H3Event, courseId: string): Promise<void> {
  try {
    const db = tenantDb(event, { as: 'operator' })
    const count = await publishedLessonCount(event, courseId)
    await db.update(COURSES_TABLE, courseId, { lessonCount: count }, 'Course not found')
  }
  catch (error) {
    console.error(`[courses] lessonCount-Sync für ${courseId} fehlgeschlagen:`, error)
  }
}

/**
 * Published-Lektion + zugehöriger Kurs in einem Rutsch — beide durch die Tür
 * (get belegt die Zugehörigkeit, ein fremder Mandant bekommt 404). Gemeinsamer
 * Vorlauf von GET /api/lessons/:id und POST /api/lessons/:id/complete.
 * Den Kurs-STATUS prüft die aufrufende Route (die beiden tun das bewusst
 * unterschiedlich — Verhalten unverändert übernommen).
 */
export async function publishedLessonWithCourse(
  event: H3Event,
  lessonId: string,
): Promise<{ lesson: LessonRow, course: CourseRow }> {
  const db = tenantDb(event, { as: 'operator' })
  const lesson = await db.get<LessonRow>(LESSONS_TABLE, lessonId, 'Lesson not found')
  if (lesson.status !== 'published') {
    throw createError({ status: 404, statusText: 'Lesson not found' })
  }
  const course = await db.get<CourseRow>(COURSES_TABLE, lesson.courseId, 'Course not found')
  return { lesson, course }
}
