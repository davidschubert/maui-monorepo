/**
 * Die kanonische Routen-Liste der Marketing-Site — EINE Quelle für sitemap.xml
 * (und alles, was später Routen aufzählen muss).
 *
 * Bewusst handgeführt statt aus dem Router geraten: die Site hat locale-eigene
 * Pfade (defineI18nRoute: /gdpr ↔ /de/dsgvo) und dynamische [slug]-Seiten mit
 * FESTEN Slug-Listen. Eine Liste, die man liest, ist hier ehrlicher als eine
 * Heuristik, die bei einem neuen Slug still das Falsche ausliefert.
 *
 * Regel beim Erweitern: neue Seite → hier eintragen (en + de). Der Sitemap-Test
 * (Route-Vergleich) fällt sonst auf.
 */
export interface MarketingRoute {
  /** Pfad in der EN-Default-Locale (ohne Prefix). */
  en: string
  /** Pfad in DE (immer mit /de-Prefix). */
  de: string
  /** Relative Priorität für die Sitemap (0.0–1.0). */
  priority: number
}

const VS_SLUGS = ['circle', 'skool', 'mighty-networks']
const AUDIENCE_SLUGS = ['coaches', 'kurse', 'creator', 'vereine']
// NUR belegte Bausteine — kurse/events erst, wenn ihr Gate grün ist (§2.4).
const FEATURE_SLUGS = ['diskussionen', 'branding']

export const MARKETING_ROUTES: MarketingRoute[] = [
  { en: '/', de: '/de', priority: 1.0 },
  { en: '/gdpr', de: '/de/dsgvo', priority: 0.8 },
  { en: '/switch', de: '/de/wechseln', priority: 0.8 },
  { en: '/glossary', de: '/de/glossar', priority: 0.5 },
  ...VS_SLUGS.map(slug => ({ en: `/vs/${slug}`, de: `/de/vs/${slug}`, priority: 0.8 })),
  ...AUDIENCE_SLUGS.map(slug => ({ en: `/fuer/${slug}`, de: `/de/fuer/${slug}`, priority: 0.7 })),
  ...FEATURE_SLUGS.map(slug => ({ en: `/features/${slug}`, de: `/de/features/${slug}`, priority: 0.7 })),
]

/** Basis-URL ohne trailing slash (aus NUXT_PUBLIC_I18N_BASE_URL). */
export function marketingBaseUrl(): string {
  const raw = process.env.NUXT_PUBLIC_I18N_BASE_URL || 'https://pukalani.app'
  return raw.replace(/\/+$/, '')
}
