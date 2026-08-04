import type { H3Event } from 'h3'
import type { AnalyticsConfigResponse } from '../../shared/types/analytics'

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
