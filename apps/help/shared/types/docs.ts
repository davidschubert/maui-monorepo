import type { ContentNavigationItem } from '@nuxt/content'

/**
 * Domänen-Typen der Hilfe-Site. Sie liegen in `shared/types/` (Projektregel:
 * NIE `app/types/`) — die Utility, die sie benutzt, bleibt in `app/utils/`,
 * weil sie nur im Browser/SSR-Rendering gebraucht wird.
 *
 * Die zwei Abschnitte = die zwei Content-Sammlungen (content.config.ts):
 *  - `anleitung`  — Betreiber einer Community (keine Technik-Vorkenntnisse)
 *  - `entwickler` — wer das Widget einbindet oder die API anspricht
 */
export type DocsSectionKey = 'anleitung' | 'entwickler'

/** Navigation je Sammlung, wie app.vue sie bereitstellt. */
export type DocsNavigation = Record<DocsSectionKey, ContentNavigationItem[]>

/** Ein Eintrag der Abschnitts-Leiste (Kopfzeile) — siehe app/utils/docsSections.ts. */
export interface DocsSection {
  key: DocsSectionKey
  /** Pfad-Prefix der Sammlung; hält Route und Content-Pfad deckungsgleich. */
  prefix: string
  labelKey: string
  icon: string
}
