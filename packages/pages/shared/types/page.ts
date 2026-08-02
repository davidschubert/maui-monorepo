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
  /** E8-3: Scope-Spalte (pages-005); tenantId ist mit pages-006 gefallen. */
  communityId?: string
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

/**
 * Nav-Eintrag einer veröffentlichten Seite — bewusst OHNE body.
 *
 * WOHNT HIER UND NICHT AN DER ROUTE (Audit 2026-08-02): der Konsument ist das
 * default-Layout des blueprint-Layers, und der importierte den Typ bis heute
 * direkt aus `server/api/pages/public/index.get.ts`. Damit zog App-Code eine
 * Nitro-Route in sein Programm, die `node-appwrite` und Server-Auto-Imports
 * (`defineEventHandler`, `tenantDb`) auf oberster Ebene benutzt — der
 * `server`-Zweig eines Layers ist aus jeder `tsconfig.app.json`
 * ausgeschlossen, genau dieser Import-Kante wegen. Und zwar zu Recht: der
 * Import zog eine Nitro-Route in das App-Programm, in dem ihre
 * Auto-Imports gar nicht existieren.
 *
 * Zur Laufzeit war es harmlos (`import type` wird
 * gelöscht), als Schnitt aber falsch: geteilte Domain-Typen gehören nach
 * `shared/types/` (CLAUDE.md), damit Server UND App sie sehen dürfen.
 */
export interface PublicPageNavItem {
  slug: string
  title: string
  sortOrder: number
}

/** Admin-Gruppierung: ein slug mit allen seinen Sprachversionen. */
export interface PageGroup {
  slug: string
  sortOrder: number
  locales: Array<Pick<PageRow, '$id' | 'locale' | 'title' | 'status'>>
}
