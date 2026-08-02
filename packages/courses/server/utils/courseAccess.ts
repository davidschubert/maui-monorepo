import { Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { COURSE_PAID_UNAVAILABLE_CODE, COURSE_UPGRADE_REQUIRED_CODE, COURSES_TABLE, ENROLLMENTS_TABLE, LESSONS_TABLE, type CourseAccess, type CourseRow, type EnrollmentRow, type LessonRow } from '../../shared/types/course'

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
 * kennt billing NICHT — die APP registriert den Guard und prüft darin das im
 * Kurs deklarierte `entitlementProduct` gegen `getEntitledProducts()`
 * (apps/comments/server/plugins/course-access.ts). OHNE registrierten Guard
 * sind 'paid'-Kurse FAIL-CLOSED (403).
 * (Stand 2026-08-02 — hier stand bis zum Audit „billings requireEntitlement",
 * das mit G1 entfallen ist; halbes F22.)
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

/**
 * Kann diese Instanz 'paid'-Kurse überhaupt freischalten? (F13-Muster)
 *
 * Das ist DIESELBE Wahrheit, die `assertCourseAccess` benutzt — kein zweites
 * Flag und keine Config, die daneben altern könnte: entweder eine App hat
 * einen Guard registriert (Silo: apps/comments gegen billings Entitlements)
 * oder nicht (Pool: fail-closed 403). Das Dashboard-Formular fragt sie über
 * /api/courses/manage, damit ein Owner dort keinen Kurs anlegen kann, den
 * anschließend niemand buchen kann — im Pool zeigte der Buchen-Knopf sonst
 * einen Upgrade-Hinweis auf ein /pricing, das es dort gar nicht gibt.
 */
export function isCourseAccessConfigured(): boolean {
  return accessGuard !== null
}

/**
 * free/members = eingeloggt genügt · paid = delegiert an den App-Guard
 *
 * BEIDE 403 tragen einen fachlichen Grund (`data.code` → `reason` im Envelope,
 * Audit-Befund 2026-08-02). Ohne ihn konnte die Oberfläche „diese Instanz
 * verkauft gar nichts" nicht von „hier hilft ein Upgrade" unterscheiden und
 * schickte im Pool jeden auf ein /pricing, das es dort nicht gibt.
 */
export async function assertCourseAccess(event: H3Event, course: CourseRow): Promise<void> {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  if (course.access !== 'paid') return
  if (!accessGuard) {
    throw createError({
      status: 403,
      statusText: 'Paid course — access not configured',
      data: { code: COURSE_PAID_UNAVAILABLE_CODE },
    })
  }
  const allowed = await accessGuard(event, course).catch(() => false)
  if (!allowed) {
    throw createError({
      status: 403,
      statusText: 'Upgrade required',
      data: { code: COURSE_UPGRADE_REQUIRED_CODE },
    })
  }
}

/**
 * Befund 2 (2026-08-02): 'paid' annehmen, was niemand buchen kann?
 *
 * Der F13-Fix wirkte nur im FORMULAR (die Auswahl verschwindet ohne Guard) —
 * über die API, einen alten Client oder einen zweiten Tab entstand weiter ein
 * Kurs, dessen Buchen-Knopf anschließend nur noch 403 sagt. Die Regel gehört
 * dorthin, wo sie niemand umgehen kann, und sie liest DIESELBE Wahrheit wie das
 * Formular (`isCourseAccessConfigured`) — kein zweites Flag.
 *
 * 422 statt 403: das ist keine fehlende Berechtigung, sondern eine Eingabe, die
 * auf dieser Instanz keinen Sinn ergibt — dieselbe Sorte wie „paid braucht ein
 * Entitlement-Produkt" eine Zeile weiter.
 */
export function assertPaidAccessOffered(access: CourseAccess): void {
  if (access !== 'paid' || isCourseAccessConfigured()) return
  throw createError({
    status: 422,
    statusText: 'Paid courses are not available on this instance',
    data: { code: COURSE_PAID_UNAVAILABLE_CODE },
  })
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

/**
 * lessonCount (denormalisiert) autoritativ nachziehen — best-effort.
 *
 * WER HANDELT (F17): KEIN `actor` — ein abgeleiteter Zähler, kein eigener
 * Schreibvorgang. Der Mensch hat eine Zeile vorher gehandelt (Lektion anlegen/
 * ändern/löschen), und DORT greifen Sperre und Beitritt; scheitert es dort, ist
 * dieser Nachzug ohnehin nie erreicht. Ihn zusätzlich unter die Sperre zu
 * stellen, hieße nur, dass eine gesperrte Community mit einer falschen Zahl
 * dasteht.
 */
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
