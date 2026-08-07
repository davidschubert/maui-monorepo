import type { Models } from 'node-appwrite'

/** Table analytics_settings (Migrationen analytics-001, analytics-002). */
export const ANALYTICS_SETTINGS_TABLE = 'analytics_settings'

/**
 * EINE Row je Community (Pool) bzw. je Instanz (Silo/Einzelbetrieb,
 * communityId ''). Der Unique-Index liegt auf `communityId` — der Schlüssel
 * IST hier der Mandant, die Pool-Unique-Regel ist damit erfüllt.
 */
export interface AnalyticsSettingsRow extends Models.Row {
  communityId: string
  /** EIGENE Plausible-Site (`pa-…`) oder '' — schlägt den Schalter. */
  plausibleScriptId: string
  /** Schalter „Messung aktiv" auf der Sammel-Site (analytics-002). */
  enabled: boolean
}

/**
 * Antwort von GET /api/analytics/config.
 *
 * ÖFFENTLICH und trotzdem drei Felder (v2): das Head-Plugin liest nur
 * `scriptId`, das Dashboard braucht zusätzlich die beiden EINGABEN, aus denen
 * sie gerechnet wurde — sonst könnte es Schalter und „Erweitert"-Feld nicht auf
 * den gespeicherten Stand setzen. Eine zweite Leseroute nur fürs Dashboard wäre
 * eine zweite Wahrheit.
 *
 * Verraten wird dabei nichts Neues: die Ids stehen als `<script src>` im
 * Quelltext jeder Seite, und die Id der Sammel-Site steht in der App-Config,
 * die mit dem Client-Bundle ausgeliefert wird — `enabled` wäre daraus ohnehin
 * ablesbar.
 */
export interface AnalyticsConfigResponse {
  /** Die EFFEKTIV geladene Id ('' = auf dieser Community wird nichts gemessen). */
  scriptId: string
  /** Die eigene Site der Community ('' = keine) — das „Erweitert"-Feld. */
  ownScriptId: string
  /** Der Schalter, wie er gespeichert ist (unabhängig von der eigenen Site). */
  enabled: boolean
}

/** Ein Punkt der 30-Tage-Reihe (ISO-Datum, so wie Plausible es liefert). */
export interface AnalyticsSeriesPoint {
  date: string
  visitors: number
}

/** Eine Zeile der Listen „Top-Seiten" bzw. „Top-Quellen". */
export interface AnalyticsNamedCount {
  name: string
  visitors: number
}

/**
 * Eine Zeile der Ereignis-Liste (F47): `name` ist der GESPEICHERTE Plausible-
 * Name aus dem Vokabular (core/shared/analyticsEvents.ts), die Anzeige
 * übersetzt ihn über `analyticsEventKey`. `count` zählt Ereignisse, nicht
 * Besucher — die Frage ist „wie oft?", nicht „wie viele Menschen?".
 */
export interface AnalyticsEventCount {
  name: string
  count: number
}

export interface AnalyticsTotals {
  visitors: number
  pageviews: number
  visitDurationSeconds: number
  /** Absprungrate in Prozent, so wie Plausible sie liefert (0–100). */
  bounceRate: number
}

/**
 * Antwort von GET /api/analytics/stats.
 *
 * DREI ZUSTÄNDE, bewusst über zwei Flags statt über HTTP-Codes — die Seite soll
 * in allen dreien LEBEN statt in einen Fehlerzweig zu fallen:
 *  - `active: false`             → für diese Community wird nichts gemessen.
 *  - `active: true, unavailable` → es wird gemessen, die Zahlen sind aber
 *    gerade nicht zu holen (kein API-Schlüssel, Plausible antwortet nicht).
 *  - `active: true` mit Daten    → der Normalfall.
 */
export interface AnalyticsStatsResponse {
  active: boolean
  unavailable?: true
  today?: { visitors: number }
  totals?: AnalyticsTotals
  series?: AnalyticsSeriesPoint[]
  topPages?: AnalyticsNamedCount[]
  topSources?: AnalyticsNamedCount[]
  /**
   * Die vordefinierten Ereignisse (F47). FEHLT (undefined), wenn nur diese
   * eine Teil-Abfrage scheiterte — die Seite zeigt die Karte dann nicht,
   * statt die ganze Statistik auf „nicht erreichbar" zu stellen. Leer heißt
   * dagegen ehrlich: gemessen wird, passiert ist (noch) nichts.
   */
  topEvents?: AnalyticsEventCount[]
}
