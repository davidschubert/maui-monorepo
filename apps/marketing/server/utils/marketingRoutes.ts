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
// ALLE sechs Produkt-Seiten — deckungsgleich mit SLUGS in
// app/pages/produkte/[slug].vue. beitraege/kurse/events sind Early Access: ihre
// Seiten tragen den EA-Banner und KEINEN Kauf-CTA (§2.4), dürfen aber
// indexiert werden. moderation + beitraege fehlten hier bis 2026-07-30 —
// zwei existierende, verlinkte Seiten standen in keiner Sitemap.
const FEATURE_SLUGS = ['diskussionen', 'moderation', 'branding', 'beitraege', 'kurse', 'events']

export const MARKETING_ROUTES: MarketingRoute[] = [
  { en: '/', de: '/de', priority: 1.0 },
  { en: '/gdpr', de: '/de/dsgvo', priority: 0.8 },
  { en: '/switch', de: '/de/wechseln', priority: 0.8 },
  { en: '/faq', de: '/de/faq', priority: 0.6 },
  { en: '/glossary', de: '/de/glossar', priority: 0.5 },
  ...VS_SLUGS.map(slug => ({ en: `/vs/${slug}`, de: `/de/vs/${slug}`, priority: 0.8 })),
  // EIN Segment für beide Sprachen (Davids Entscheidung 2026-07-30): die alten
  // /for/* bzw. /de/fuer/* leiten per routeRules 301 weiter und gehören
  // deshalb NICHT mehr in die Sitemap — dort steht nur die Zieladresse.
  ...AUDIENCE_SLUGS.map(slug => ({ en: `/use-cases/${slug}`, de: `/de/use-cases/${slug}`, priority: 0.7 })),
  // Anders als die Anwendungsfälle bleiben die Produkt-Seiten locale-eigen
  // (defineI18nRoute in produkte/[slug].vue: en /products, de /produkte). Die
  // alten /features/* leiten 301 weiter und standen bis 2026-07-30 hier — eine
  // Sitemap darf nur Zieladressen anbieten, keine Weiterleitungen.
  ...FEATURE_SLUGS.map(slug => ({ en: `/products/${slug}`, de: `/de/produkte/${slug}`, priority: 0.7 })),
]
// Rechtsseiten (/imprint, /privacy, /terms) fehlen ABSICHTLICH: sie sind bis zu
// den verbindlichen Texten noindex — eine noindex-Seite in der Sitemap wäre ein
// Widerspruch, den Google zu Recht meldet.

/** Basis-URL ohne trailing slash (aus NUXT_PUBLIC_I18N_BASE_URL). */
export function marketingBaseUrl(): string {
  const raw = process.env.NUXT_PUBLIC_I18N_BASE_URL || 'https://pukalani.app'
  return raw.replace(/\/+$/, '')
}
