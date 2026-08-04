import type { Models } from 'node-appwrite'

export const PAGES_TABLE = 'pages'

export const PAGE_STATUSES = ['draft', 'published'] as const
export type PageStatus = (typeof PAGE_STATUSES)[number]

/**
 * Die Adresse der Community-Regeln (F1 Stufe 2).
 *
 * STEHT HIER UND NICHT IN `guidelinesTemplate.ts`, obwohl sie inhaltlich
 * dorthin gehörte: der Navigationspunkt im blueprint-Layer braucht sie, und ein
 * Wert-Import aus der Vorlagen-Datei zöge deren gesamten Text (beide Sprachen,
 * mehrere Kilobyte) in das CLIENT-Bundle jeder App — für eine Zeichenkette.
 * `page.ts` ist ohnehin das Wert-Modul dieses Layers (PAGES_TABLE,
 * PAGE_STATUSES) und in jedem Konsumenten schon drin.
 *
 * Die Vorlage importiert sie von hier, damit es genau EINE Quelle bleibt — ein
 * zweites `'guidelines'` als Zeichenkette wäre die Sorte Kopplung, die still
 * auseinanderläuft.
 */
export const GUIDELINES_SLUG = 'guidelines'

/**
 * Die Adresse des Beschreibungs- und Kontakttextes der About-Seite (F1 Stufe 2).
 *
 * WARUM ÜBER DEN pages-LAYER und nicht über eine eigene Einstellung: der Text
 * gehört DER COMMUNITY und muss vom Owner editierbar sein. `app_config` ist EINE
 * Row pro Appwrite-PROJEKT — im Pool teilen sich alle Communities sie, ein
 * Schreiber überschriebe alle anderen (derselbe Grund, aus dem das Branding an
 * `communities.*` hängt und nicht dort). Eine neue Spalte im Control Plane wäre
 * eine Migration, eine Service-Route und ein Formularfeld für etwas, das der
 * pages-Layer seit pages-004 kann: mandantengebundene, owner-editierbare
 * Textseiten mit Markdown-Body und Dashboard-Verwaltung.
 *
 * BEWUSST NICHT GESEEDET, anders als die Regeln: für die Regeln gibt es einen
 * Text, der überall gilt; für „worum es hier geht" gibt es ihn nicht. Ein
 * erfundener Beschreibungstext im Namen der Community wäre genau die Sorte
 * Fülltext, die niemand entfernt. Fehlt die Seite, zeigt die About-Seite ihre
 * Zahlen und sagt dem, der sie schreiben darf, wo er das tut.
 */
export const DISCUSSIONS_ABOUT_SLUG = 'discussions-about'

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

/**
 * Was der Editor im Dashboard von einer Sprachversion braucht — bewusst KEIN
 * `Models.Row`.
 *
 * WARUM EIN EIGENES DTO (F1, kleines Paket 2026-08-04): seit die Regeln-Seite
 * für Bestands-Communities als VORLAGE ausgeliefert wird, hat die Antwort von
 * `/api/pages/:slug` einen Fall ohne Row dahinter. Eine Vorlage in ein
 * `PageRow` zu pressen hieße, `$id`, `$createdAt`, `$permissions` &c. zu
 * erfinden — Felder, die aussehen wie Wahrheit über eine gespeicherte Zeile,
 * es aber nicht sind. Der Editor hat sie nie gelesen; er braucht genau diese
 * fünf.
 */
export interface PageEditorRow {
  locale: string
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
  /**
   * Es gibt zu diesem slug noch KEINE Zeile — was hier steht, ist unsere
   * Vorlage (heute nur `guidelines`). `$id` ist deshalb leer, und die Liste
   * darf das sichtbar machen: „Vorlage" statt einer Seite, die es gäbe.
   */
  isTemplate?: true
}
