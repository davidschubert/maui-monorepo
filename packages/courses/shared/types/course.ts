import type { Models } from 'node-appwrite'

export const COURSES_TABLE = 'courses'
export const LESSONS_TABLE = 'lessons'
export const ENROLLMENTS_TABLE = 'enrollments'
export const LESSON_PROGRESS_TABLE = 'lesson_progress'

export type CourseStatus = 'draft' | 'published' | 'archived'
export type LessonStatus = 'draft' | 'published'

export const COURSE_ACCESS = ['free', 'members', 'paid'] as const
export type CourseAccess = (typeof COURSE_ACCESS)[number]

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
  /** Pflicht bei access 'paid' — Feature-String, den der App-Guard prüft */
  entitlementFeature: string | null
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
