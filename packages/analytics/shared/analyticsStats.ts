import { ANALYTICS_EVENT_NAMES } from '../../core/shared/analyticsEvents'
import { isPlausibleScriptId } from '../../core/shared/analyticsScript'
import type { AnalyticsSettingsLike } from '../../core/shared/analyticsScript'
import type { AnalyticsEventCount, AnalyticsNamedCount, AnalyticsSeriesPoint, AnalyticsTotals } from './types/analytics'

/**
 * DER VERTRAG ZUR PLAUSIBLE-STATS-API — pur, ohne h3, ohne fetch.
 *
 * Warum das hier liegt und nicht in der Route: die Route darf nur noch
 * „schicken und einsammeln". Alles, was man falsch machen kann — welche Site
 * gefragt wird, ob der Hostname-Filter dranhängt, in welcher Reihenfolge die
 * Metriken zurückkommen — ist hier eine Funktion mit Test. Ein vergessener
 * Filter wäre kein Schönheitsfehler, sondern die Besucherzahlen ALLER
 * Communities in der Ansicht einer einzigen.
 *
 * Alle Formen sind am 2026-08-04 live gegen plausible.hawaii.studio gemessen
 * (`POST /api/v2/query`, Bearer-Key):
 *   Antwort  {"results":[{"metrics":[…],"dimensions":[…]}]}
 *   Fehler   {"error":"…"} mit non-2xx
 */

/** Ein Filter der v2-API. Wir brauchen genau eine Form: `is` auf eine Liste. */
export type PlausibleFilter = ['is', string, string[]]

export interface PlausibleQuery {
  site_id: string
  metrics: string[]
  date_range: string
  filters?: PlausibleFilter[]
  dimensions?: string[]
  pagination?: { limit: number }
}

/** Nur, was wir lesen — das SDK-lose Gegenstück zur Antwort der v2-API. */
export interface PlausibleQueryResponse {
  results?: { metrics?: unknown[], dimensions?: unknown[] }[]
}

/**
 * WOHIN die Frage geht — und ob sie überhaupt gestellt werden kann.
 *
 *  - `off`         → es wird nichts gemessen, es gibt nichts zu zeigen.
 *  - `unavailable` → es wird gemessen, aber wir können die Zahlen nicht holen
 *    (die App hat eine Sammel-Id ohne Site-Schlüssel, oder der Request hat
 *    keinen Host). Das ist NICHT dasselbe wie `off`: die Seite muss „gerade
 *    nicht erreichbar" sagen und darf nicht behaupten, die Messung sei aus.
 *  - `ready`       → Site-Schlüssel und Filter stehen.
 */
export type AnalyticsStatsTarget =
  | { state: 'off' }
  | { state: 'unavailable' }
  | { state: 'ready', siteId: string, filters: PlausibleFilter[] }

/** Die Sammel-Site des Deployments, wie sie in der App-Config steht. */
export interface AnalyticsSharedSiteConfig {
  scriptId?: string
  siteId?: string
}

/**
 * PURE (unit-getestet): Welche Plausible-Site beantwortet die Frage dieser
 * Community — und mit welchem Filter?
 *
 * ZWEI MODI, dieselbe Rangfolge wie beim Script (`effectiveScriptId`):
 *
 *  1. EIGENE SITE: der Owner hat eine eigene Plausible-Site hinterlegt. Dann
 *     ist der Site-Schlüssel der HOST der Community und es braucht keinen
 *     Filter — in dieser Site steht ohnehin nur sie selbst.
 *     ANNAHME, die dabei bewusst getroffen wird: die Domain der eigenen Site
 *     ist der Host, unter dem die Community läuft. Anders geht es nicht: die
 *     Script-Id verrät die Domain nicht, und die CE hat keine Sites-API, über
 *     die wir sie erfragen könnten. Stimmt die Annahme nicht (die Site heißt in
 *     Plausible anders), antwortet die API mit einem Fehler und die Seite sagt
 *     „gerade nicht erreichbar" — sie zeigt NIE fremde Zahlen, denn ein
 *     falscher Site-Schlüssel trifft keine andere Community, sondern nichts.
 *  2. SAMMEL-SITE: der Schalter steht an. Site-Schlüssel ist die eine
 *     Sammel-Site, und der `event:hostname`-Filter ist die GANZE Trennung
 *     zwischen den Communities — deshalb steht er hier und nicht in der Route.
 *
 * Der Host kommt IMMER vom Server (Request-Host), NIE aus der Anfrage des
 * Clients: sonst könnte sich jeder Owner die Zahlen einer fremden Community
 * ziehen, indem er einen anderen Hostnamen mitschickt.
 */
export function resolveStatsTarget(
  row: AnalyticsSettingsLike | null | undefined,
  shared: AnalyticsSharedSiteConfig,
  host: string,
): AnalyticsStatsTarget {
  const own = row?.plausibleScriptId ?? ''
  if (own && isPlausibleScriptId(own)) {
    // Ohne Host kein Site-Schlüssel — gemessen wird trotzdem (das Script hängt
    // im Head), also „gerade nicht erreichbar" statt „aus".
    if (!host) return { state: 'unavailable' }
    return { state: 'ready', siteId: host, filters: [] }
  }

  const sharedScriptId = shared.scriptId ?? ''
  if (row?.enabled !== true || !sharedScriptId || !isPlausibleScriptId(sharedScriptId)) {
    return { state: 'off' }
  }

  const sharedSiteId = shared.siteId ?? ''
  if (!sharedSiteId || !host) return { state: 'unavailable' }
  return { state: 'ready', siteId: sharedSiteId, filters: [['is', 'event:hostname', [host]]] }
}

/**
 * Die Metriken der Übersicht — die REIHENFOLGE ist der Vertrag: die v2-API
 * antwortet mit einem Zahlen-Array in genau dieser Ordnung, ohne Namen.
 */
export const ANALYTICS_TOTAL_METRICS = ['visitors', 'pageviews', 'visit_duration', 'bounce_rate'] as const

/** Wie viele Zeilen die beiden Listen zeigen. */
export const ANALYTICS_LIST_LIMIT = 8

/** Zeitraum aller Auswertungen außer „heute". */
export const ANALYTICS_RANGE = '30d'

export interface AnalyticsQuerySet {
  today: PlausibleQuery
  totals: PlausibleQuery
  series: PlausibleQuery
  topPages: PlausibleQuery
  topSources: PlausibleQuery
  events: PlausibleQuery
}

/**
 * PURE (unit-getestet): die fünf Abfragen einer Dashboard-Ansicht.
 *
 * „Heute" und „30 Tage" lassen sich NICHT zusammenlegen — `date_range` gilt für
 * die ganze Abfrage, zwei Zeiträume brauchen also zwei Anfragen. Die Route
 * schickt alle fünf nebeneinander los.
 */
export function buildStatsQueries(siteId: string, filters: PlausibleFilter[]): AnalyticsQuerySet {
  const base = { site_id: siteId, ...(filters.length ? { filters } : {}) }
  return {
    today: { ...base, metrics: ['visitors'], date_range: 'day' },
    totals: { ...base, metrics: [...ANALYTICS_TOTAL_METRICS], date_range: ANALYTICS_RANGE },
    series: { ...base, metrics: ['visitors'], date_range: ANALYTICS_RANGE, dimensions: ['time:day'] },
    topPages: {
      ...base,
      metrics: ['visitors'],
      date_range: ANALYTICS_RANGE,
      dimensions: ['event:page'],
      pagination: { limit: ANALYTICS_LIST_LIMIT },
    },
    topSources: {
      ...base,
      metrics: ['visitors'],
      date_range: ANALYTICS_RANGE,
      dimensions: ['visit:source'],
      pagination: { limit: ANALYTICS_LIST_LIMIT },
    },
    /**
     * DIE VORDEFINIERTEN EREIGNISSE (F47): Aufschlüsselung nach `event:name`,
     * gefiltert auf GENAU das Plattform-Vokabular (core/shared/
     * analyticsEvents.ts). Der Filter ist keine Kosmetik: ohne ihn stünden
     * die eingebauten `pageview`/`engagement`-Events als größte Zeilen in der
     * Liste — und auf einer eigenen Site (BYO) dazu jedes fremde Custom Event.
     * Er wird per UND an den Hostname-Filter der Sammel-Site GEHÄNGT, nicht
     * statt ihm — sonst zählte die Liste die Aktionen ALLER Communities.
     * `events` als Metrik, weil die Frage „wie oft passiert?" ist, nicht „wie
     * viele Menschen?" — 30 Kommentare von 3 Leuten sind 30 Kommentare.
     */
    events: {
      ...base,
      filters: [...filters, ['is', 'event:name', [...ANALYTICS_EVENT_NAMES]]],
      metrics: ['events'],
      date_range: ANALYTICS_RANGE,
      dimensions: ['event:name'],
      pagination: { limit: ANALYTICS_LIST_LIMIT },
    },
  }
}

/**
 * Eine Zahl aus der Antwort holen — fehlt sie oder ist sie keine, wird daraus
 * 0 und nicht NaN. Eine Kachel mit „NaN" wäre schlimmer als eine mit „0": sie
 * sieht nach einem Fehler in unserem Dashboard aus, nicht nach fehlenden Daten.
 */
function numberAt(metrics: unknown[] | undefined, index: number): number {
  const value = metrics?.[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function textAt(dimensions: unknown[] | undefined, index: number): string {
  const value = dimensions?.[index]
  return typeof value === 'string' ? value : ''
}

/** PURE: die eine Besucherzahl einer Totals-Abfrage (Zeitraum „heute"). */
export function mapVisitors(response: PlausibleQueryResponse): number {
  return numberAt(response.results?.[0]?.metrics, 0)
}

/** PURE: die vier Übersichtszahlen — Reihenfolge = ANALYTICS_TOTAL_METRICS. */
export function mapTotals(response: PlausibleQueryResponse): AnalyticsTotals {
  const metrics = response.results?.[0]?.metrics
  return {
    visitors: numberAt(metrics, 0),
    pageviews: numberAt(metrics, 1),
    visitDurationSeconds: Math.round(numberAt(metrics, 2)),
    bounceRate: numberAt(metrics, 3),
  }
}

/**
 * PURE: die Tagesreihe. Einträge ohne Datum fallen raus — ein Balken ohne
 * Beschriftung ist für einen Screenreader nichts als Rauschen.
 */
export function mapSeries(response: PlausibleQueryResponse): AnalyticsSeriesPoint[] {
  return (response.results ?? [])
    .map(entry => ({ date: textAt(entry.dimensions, 0), visitors: numberAt(entry.metrics, 0) }))
    .filter(point => point.date !== '')
}

/**
 * PURE: eine Dimensions-Liste (Seiten, Quellen). Einträge ohne Namen fallen
 * raus — bei `visit:source` ist der Direktzugriff eine leere Zeichenkette, und
 * eine namenlose Zeile in einer Top-Liste erklärt niemandem etwas.
 */
export function mapNamedCounts(response: PlausibleQueryResponse): AnalyticsNamedCount[] {
  return (response.results ?? [])
    .map(entry => ({ name: textAt(entry.dimensions, 0), visitors: numberAt(entry.metrics, 0) }))
    .filter(entry => entry.name !== '')
}

/**
 * PURE: die Ereignis-Liste (F47) — Name + wie oft. Dieselbe Hygiene wie bei
 * den anderen Listen: ohne Namen keine Zeile, und Nullzähler fallen raus (die
 * Abfrage liefert sie ohnehin nicht, aber eine Zeile „Kommentare: 0" wäre
 * auch aus einer künftigen API-Version keine Information).
 */
export function mapEventCounts(response: PlausibleQueryResponse): AnalyticsEventCount[] {
  return (response.results ?? [])
    .map(entry => ({ name: textAt(entry.dimensions, 0), count: numberAt(entry.metrics, 0) }))
    .filter(entry => entry.name !== '' && entry.count > 0)
}
