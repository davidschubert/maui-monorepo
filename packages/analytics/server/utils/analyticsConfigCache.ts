import type { H3Event } from 'h3'
import type { AnalyticsConfigResponse, AnalyticsStatsResponse } from '../../shared/types/analytics'

/**
 * Microcache der öffentlichen Config-Antwort (60 s).
 *
 * Sie ist user-agnostisch (eine Script-Id, keine Session-Daten) und wird bei
 * JEDEM Seitenaufbau gelesen — das Head-Plugin fragt sie im SSR. Ohne Cache
 * wäre das eine Appwrite-Abfrage pro Seitenaufruf für einen Wert, der sich
 * einmal im Jahr ändert.
 *
 * DER SCHLÜSSEL TRÄGT DEN MANDANTEN (Cross-Tenant-Cache-Regel, H3): sonst
 * bekäme Kunde B die Script-Id von Kunde A in seine Seiten gestempelt — und
 * das ist nicht nur falsch gemessen, es verrät auch fremde Konfiguration.
 *
 * Liegt in server/utils, weil ZWEI Routen ihn brauchen: die Leseroute füllt
 * ihn, die Schreibroute setzt ihn nach dem Speichern direkt neu (statt bis zu
 * 60 s zu warten oder den Cache für alle Mandanten zu leeren).
 */
const analyticsConfigCache = createMicrocache<AnalyticsConfigResponse>(60_000)

export function analyticsConfigCacheKey(event: H3Event): string {
  return `analytics:${tenantCacheScope(event)}`
}

export function readAnalyticsConfigCache(event: H3Event): AnalyticsConfigResponse | undefined {
  return analyticsConfigCache.get(analyticsConfigCacheKey(event))
}

export function writeAnalyticsConfigCache(event: H3Event, value: AnalyticsConfigResponse): void {
  analyticsConfigCache.set(analyticsConfigCacheKey(event), value)
}

/**
 * ZWEITER Cache für die ZAHLEN (120 s) — bewusst neben dem oberen und nicht in
 * ihm.
 *
 * Es sind zwei verschiedene Dinge mit zwei verschiedenen Kosten: die Config ist
 * ein Feld aus Appwrite und wird bei JEDEM Seitenaufbau gelesen; die Statistik
 * sind FÜNF Abfragen gegen eine fremde Instanz und wird nur beim Öffnen einer
 * Dashboard-Seite gebraucht. Ein gemeinsamer Eintrag hieße, dass jeder Gast
 * einer Community die Zahlen ihres Owners mit im Speicher hätte.
 *
 * DER SCHLÜSSEL TRÄGT MANDANT UND ZWECK: derselbe Grund wie oben, plus der
 * eigene Namensraum — sonst überschriebe eines der beiden das andere, sobald
 * ein dritter Cache dazukommt.
 *
 * BENUTZERUNABHÄNGIG, wie es der Microcache verlangt: in der Antwort stehen
 * Besuchszahlen einer Community, keine Sitzungsdaten. Wer sie SEHEN darf,
 * entscheidet vorher `requireCommunityPermission` in der Route — der Cache
 * liegt hinter dieser Prüfung, nicht vor ihr.
 *
 * 120 s, weil Plausible selbst in Minuten denkt: eine Ansicht, die 2 Minuten
 * alt ist, sieht niemand — fünf Abfragen bei jedem F5 dagegen schon.
 */
const analyticsStatsCache = createMicrocache<AnalyticsStatsResponse>(120_000)

export function analyticsStatsCacheKey(event: H3Event): string {
  return `analytics:stats:${tenantCacheScope(event)}`
}

export function readAnalyticsStatsCache(event: H3Event): AnalyticsStatsResponse | undefined {
  return analyticsStatsCache.get(analyticsStatsCacheKey(event))
}

export function writeAnalyticsStatsCache(event: H3Event, value: AnalyticsStatsResponse): void {
  analyticsStatsCache.set(analyticsStatsCacheKey(event), value)
}

/**
 * Nach dem Umschalten: den Eintrag GENAU dieses Mandanten wegwerfen. Neu setzen
 * geht hier nicht — die neuen Zahlen kommen aus einer anderen Plausible-Site
 * und müssen erst geholt werden; ein `clear()` wiederum träfe alle anderen
 * Communities ohne Not.
 */
export function clearAnalyticsStatsCache(event: H3Event): void {
  analyticsStatsCache.delete(analyticsStatsCacheKey(event))
}
