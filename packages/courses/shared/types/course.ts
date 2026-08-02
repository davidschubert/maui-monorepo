import type { Models } from 'node-appwrite'

export const COURSES_TABLE = 'courses'
export const LESSONS_TABLE = 'lessons'
export const ENROLLMENTS_TABLE = 'enrollments'
export const LESSON_PROGRESS_TABLE = 'lesson_progress'

export type CourseStatus = 'draft' | 'published' | 'archived'
export type LessonStatus = 'draft' | 'published'

export const COURSE_ACCESS = ['free', 'members', 'paid'] as const
export type CourseAccess = (typeof COURSE_ACCESS)[number]

/**
 * DREI ABLEHNUNGEN, DREI SÄTZE (Audit-Befund 2026-08-02).
 *
 * Beim Einschreiben können drei ganz verschiedene 403 fallen, und die Seite
 * machte aus jedem denselben Satz „Dieser Kurs gehört zu Pro" mit einem Knopf
 * auf /pricing. Zwei davon waren dadurch gelogen: im Pool gibt es gar kein
 * /pricing (die platform-App bindet billing nicht ein — der Knopf führte ins
 * 404), und eine gesperrte Community (M13) bekam eine Kaufaufforderung statt
 * der Mahnung, die das globale Hinweis-Plugin ohnehin schon zeigt.
 *
 * Die Gründe reisen als `data.code` → `reason` im Envelope (core/server/error.ts).
 * Der dritte Fall trägt `community_suspended` und gehört dem Core; er steht
 * bewusst NICHT hier, damit es keine zweite Kopie desselben Schlüssels gibt.
 *
 * WARUM DER GRUND ZUGLEICH DIE ANTWORT AUF „GIBT ES HIER EIN /pricing?" IST:
 * `course_upgrade_required` kann per Konstruktion nur fallen, wenn ein
 * Access-Guard registriert ist (assertCourseAccess) — und den registriert die
 * App, die auch billing einbindet (apps/comments). Kein Guard ⇒ kein billing ⇒
 * kein /pricing ⇒ `course_paid_unavailable`. Damit braucht die Seite kein
 * zweites Flag neben `paidAvailable`, das daneben altern könnte.
 */
/** Diese Instanz kann 'paid' gar nicht freischalten (kein Guard registriert). */
export const COURSE_PAID_UNAVAILABLE_CODE = 'course_paid_unavailable'
/** Guard vorhanden, hat aber abgelehnt — hier führt ein Upgrade wirklich weiter. */
export const COURSE_UPGRADE_REQUIRED_CODE = 'course_upgrade_required'

export const MAX_COURSE_TITLE = 200
export const MAX_COURSE_DESCRIPTION = 5000
// GOALS sagte 50k — MariaDB/utf8mb4 begrenzt die Zeile auf ~65 KB (×4 Bytes
// pro Zeichen, column_limit_exceeded bei 16k neben den übrigen Spalten).
// 15k Zeichen sind für eine Lektion weiterhin sehr großzügig.
export const MAX_LESSON_CONTENT = 15_000

export interface CourseRow extends Models.Row {
  title: string
  /** URL-Slug (unique) */
  slug: string
  description: string
  status: CourseStatus
  access: CourseAccess
  /** Pflicht bei access 'paid' — Produkt-String, den der App-Guard prüft */
  entitlementProduct: string | null
  authorId: string
  authorName: string
  /** denormalisiert: Anzahl PUBLISHED Lektionen (Server-Recount) */
  lessonCount: number
}

export interface LessonRow extends Models.Row {
  courseId: string
  title: string
  order: number
  /** Markdown (Core-Sink MarkdownContent) — niemals Raw-HTML */
  content: string
  videoUrl: string | null
  status: LessonStatus
}

export interface EnrollmentRow extends Models.Row {
  courseId: string
  userId: string
  completedAt: string | null
}

export interface LessonProgressRow extends Models.Row {
  lessonId: string
  courseId: string
  userId: string
  completedAt: string
}

/** Lektions-Metadaten für die Kursübersicht (Titel öffentlich, Content nicht) */
export interface LessonSummary {
  $id: string
  title: string
  order: number
  status: LessonStatus
}

export interface CourseDetailResponse extends CourseRow {
  lessons: LessonSummary[]
  enrolled: boolean
  completedLessonIds: string[]
  completedAt: string | null
}

export interface CourseListResponse {
  rows: Array<CourseRow & { enrolled: boolean }>
  nextCursor: string | null
}

/** Builder-Liste (/api/courses/manage) */
export interface CourseManageResponse {
  rows: CourseRow[]
  /**
   * Ist ein Access-Guard registriert, kann diese Instanz also 'paid'-Kurse
   * freischalten? (F13-Muster, isCourseAccessConfigured) — false im Pool, wo
   * paid fail-closed ist. Das Formular blendet die Option dann aus, statt
   * einen unbuchbaren Kurs anlegen zu lassen.
   */
  paidAvailable: boolean
}
