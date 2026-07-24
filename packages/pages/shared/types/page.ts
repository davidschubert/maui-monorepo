import type { Models } from 'node-appwrite'

export const PAGES_TABLE = 'pages'

export const PAGE_STATUSES = ['draft', 'published'] as const
export type PageStatus = (typeof PAGE_STATUSES)[number]

/**
 * Eine Inhaltsseite in EINER Sprache. Ein logisches „Dokument" (slug) hat je
 * Sprache eine Row — so sind beliebige Sprachen möglich (EN Standard + weitere).
 * `body` ist Markdown (UEditor content-type="markdown"), gerendert über core
 * MarkdownContent (kein v-html).
 */
export interface PageRow extends Models.Row {
  slug: string
  locale: string
  /** H3-Pool-Datenpfad (pages-003); '' = Silo/Einzelbetrieb. */
  tenantId?: string
  title: string
  body: string
  status: PageStatus
  sortOrder: number
}

/** Öffentliches DTO (nur was die public-Route rausgibt). */
export interface PublicPage {
  slug: string
  locale: string
  title: string
  body: string
  updatedAt: string
}

/** Admin-Gruppierung: ein slug mit allen seinen Sprachversionen. */
export interface PageGroup {
  slug: string
  sortOrder: number
  locales: Array<Pick<PageRow, '$id' | 'locale' | 'title' | 'status'>>
}
