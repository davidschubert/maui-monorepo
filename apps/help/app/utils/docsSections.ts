import type { InjectionKey, Ref } from 'vue'
import type { ContentNavigationItem } from '@nuxt/content'
import type { DocsNavigation, DocsSection, DocsSectionKey } from '../../shared/types/docs'

/**
 * Die zwei Abschnitte der Hilfe-Site = die zwei Content-Sammlungen
 * (content.config.ts). EINE Quelle für Kopfzeile, Seitenleiste und
 * Seiten-Abfrage — der Abschnitt wird immer aus dem Pfad abgeleitet,
 * nie geraten. Die Domänen-Typen dazu liegen in shared/types/docs.ts
 * (Projektregel), hier bleibt nur die Utility.
 */
export const DOCS_SECTIONS = [
  { key: 'anleitung', prefix: '/anleitung', labelKey: 'docs.sections.anleitung', icon: 'i-ph-compass' },
  { key: 'entwickler', prefix: '/entwickler', labelKey: 'docs.sections.entwickler', icon: 'i-ph-code' },
] as const satisfies readonly DocsSection[]

export const docsNavigationKey = Symbol('docs-navigation') as InjectionKey<Ref<DocsNavigation | null | undefined>>

/** Pfad → Abschnitt. Alles außerhalb von /entwickler gehört zur Anleitung. */
export function resolveDocsSection(path: string): DocsSectionKey {
  return path.startsWith('/entwickler') ? 'entwickler' : 'anleitung'
}

/**
 * Prefix-Sammlungen liefern EINEN Wurzelknoten (`/anleitung`) mit den Seiten
 * als Kinder. Die Seitenleiste zeigt die Kinder, weil der Abschnitt schon in
 * der Kopfzeile gewählt wird — sonst stünde er doppelt da.
 */
export function docsSectionItems(
  navigation: DocsNavigation | null | undefined,
  section: DocsSectionKey,
): ContentNavigationItem[] {
  const items = navigation?.[section] ?? []
  const prefix = DOCS_SECTIONS.find(entry => entry.key === section)?.prefix
  const root = items.find(item => item.path === prefix)
  return root?.children ?? items
}
