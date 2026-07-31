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
import type { H3Event } from 'h3'
import { AUDIENCE_SLUGS, PRODUCT_SLUGS, VS_SLUGS } from '#shared/marketing'

export interface MarketingRoute {
  /** Pfad in der EN-Default-Locale (ohne Prefix). */
  en: string
  /** Pfad in DE (immer mit /de-Prefix). */
  de: string
  /** Relative Priorität für die Sitemap (0.0–1.0). */
  priority: number
}

// Die drei Slug-Kataloge stehen in shared/marketing.ts — dieselbe Liste, die
// auch die [slug]-Seiten gegen die URL prüfen. Sie standen bis 2026-07-30
// doppelt (hier UND in den Seiten), und genau dadurch fehlten `moderation` und
// `beitraege` in dieser Sitemap: zwei existierende, verlinkte Seiten, die kein
// Crawler angeboten bekam. Early Access (beitraege/kurse/events) ändert daran
// nichts — die Seiten tragen den EA-Banner und keinen Kauf-CTA (§2.4), dürfen
// aber indexiert werden.

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
  ...PRODUCT_SLUGS.map(slug => ({ en: `/products/${slug}`, de: `/de/produkte/${slug}`, priority: 0.7 })),
]
// Rechtsseiten (/imprint, /privacy, /terms) fehlen ABSICHTLICH: sie sind bis zu
// den verbindlichen Texten noindex — eine noindex-Seite in der Sitemap wäre ein
// Widerspruch, den Google zu Recht meldet.

/**
 * Basis-URL ohne trailing slash — DIESELBE KETTE WIE IM BROWSER
 * (app/composables/useSiteBaseUrl.ts): erst die konfigurierte i18n-Basis
 * (`NUXT_PUBLIC_I18N_BASE_URL` → `runtimeConfig.public.i18n.baseUrl`), sonst
 * der Origin des laufenden Requests.
 *
 * Bis 2026-07-30 stand hier `process.env.NUXT_PUBLIC_I18N_BASE_URL` mit dem
 * harten Fallback 'https://pukalani.app'. Zwei Dinge waren daran falsch: die
 * rohe Env umgeht die runtimeConfig (ein Wert, den ein Deploy dort setzt,
 * käme nie an), und der harte Fallback ließ eine lokale oder Staging-Instanz
 * eine Sitemap voller PROD-Adressen ausliefern — ein Crawler, der sie findet,
 * bekommt Adressen, die mit dieser Instanz nichts zu tun haben.
 */
export function marketingBaseUrl(event: H3Event): string {
  const publicConfig = useRuntimeConfig(event).public as { i18n?: { baseUrl?: unknown } }
  const configured = typeof publicConfig.i18n?.baseUrl === 'string' ? publicConfig.i18n.baseUrl.trim() : ''
  const fallback = getRequestURL(event).origin
  return (configured || fallback).replace(/\/+$/, '')
}
