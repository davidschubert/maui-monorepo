import type { H3Event } from 'h3'
import {
  buildStatsQueries,
  mapNamedCounts,
  mapSeries,
  mapTotals,
  mapVisitors,
  resolveStatsTarget,
} from '../../../shared/analyticsStats'
import type { PlausibleQuery, PlausibleQueryResponse } from '../../../shared/analyticsStats'
import { ANALYTICS_SETTINGS_TABLE, type AnalyticsSettingsRow, type AnalyticsStatsResponse } from '../../../shared/types/analytics'

/**
 * DIE ZAHLEN EINER COMMUNITY — Paket 2 der v2 (docs/plans/ANALYTICS-V2.md).
 *
 * Die Lücke, die sie schließt: die Messung lief seit v1, ihre Ergebnisse sah
 * der Owner aber nur in Plausible — wo er kein Konto hat. Ein Produkt, dessen
 * Wert man nicht sehen kann, ist keines.
 *
 * WER DARF: `community.analytics` (Owner-Klasse, dieselbe Capability wie beim
 * Einstellen), DANN das Tarif-Gate `requirePlanProduct` — Reihenfolge mit
 * Absicht, wie in settings.patch.ts: wer gar nicht darf, soll nicht erfahren,
 * ob er es mit einem anderen Tarif dürfte.
 *
 * DER API-SCHLÜSSEL BLEIBT HIER. Er liest die Statistik JEDER Site unserer
 * Instanz; im Browser wäre er die Erlaubnis, die Zahlen aller Kunden
 * abzuholen. Der Client bekommt deshalb nur die fertigen Zahlen — und `site_id`
 * wie Filter baut ausschließlich der Server aus dem REQUEST-HOST. Käme der Host
 * aus der Anfrage, könnte sich jeder Owner die Zahlen einer fremden Community
 * ziehen, indem er einen anderen Hostnamen mitschickt.
 *
 * FAIL-SOFT (Antwort statt Fehler): fehlt der Schlüssel oder schweigt
 * Plausible, kommt `{ active: true, unavailable: true }` zurück. Die Messung
 * läuft ja — nur die Anzeige nicht. Ein 502 hätte die Dashboard-Seite mit einer
 * Fehlermeldung überzogen, obwohl an der Community nichts kaputt ist.
 */

/**
 * Der Host kommt aus dem Request-Header, normalisiert wie überall im Repo
 * (`normalizeHost`: Kleinschreibung, Port und Punkt weg) — dieselbe Rechnung,
 * mit der die Mandanten-Middleware den Host auflöst. BEWUSST nicht über
 * `resolveSeoOrigin`: der liefert einen ORIGIN mit Schema für den Kopf einer
 * Seite, Plausibles `event:hostname` ist aber genau der nackte Hostname.
 */
function requestHost(event: H3Event): string {
  return normalizeHost(getHeader(event, 'host'))
}

/** Abbruch, bevor eine hängende fremde Instanz die Dashboard-Seite blockiert. */
const QUERY_TIMEOUT_MS = 10_000

const UNAVAILABLE: AnalyticsStatsResponse = { active: true, unavailable: true }

interface AnalyticsAppConfig {
  instance?: string
  shared?: { scriptId?: string, siteId?: string }
}

/**
 * EINE v2-Abfrage. Wirft bei allem, was nicht nach einer Antwort aussieht — der
 * Aufrufer fängt es und macht daraus „gerade nicht erreichbar".
 *
 * Fehlerform der API: non-2xx mit `{"error":"…"}`. Der Text landet im
 * Server-Log (dort hilft er beim Nachsehen) und NIE in der Antwort: er kann den
 * Site-Schlüssel oder eine Bemerkung zum Schlüssel enthalten.
 */
async function query(baseUrl: string, apiKey: string, body: PlausibleQuery): Promise<PlausibleQueryResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/api/v2/query`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      console.error(`[analytics] Stats-API ${response.status}: ${(await response.text()).slice(0, 300)}`)
      throw new Error(`stats_api_${response.status}`)
    }
    return await response.json() as PlausibleQueryResponse
  }
  finally {
    clearTimeout(timeout)
  }
}

export default defineEventHandler(async (event): Promise<AnalyticsStatsResponse> => {
  await requireCommunityPermission(event, 'community.analytics')
  requirePlanProduct(event, 'analytics')

  const cached = readAnalyticsStatsCache(event)
  if (cached) return cached

  const appConfig = useAppConfig() as { pukalani?: { analytics?: AnalyticsAppConfig } }
  const analytics = appConfig.pukalani?.analytics ?? {}

  /**
   * Die Einstellung durch die Datentür — dieselbe Klinke wie in der Leseroute:
   * die Zeile gehört der Community, nicht einer Person, und trägt deshalb keine
   * User-Rechte. `actor: 'operator'` ist auch hier keine Behauptung über einen
   * Handelnden, sondern die Wahrheit: es wird gelesen.
   */
  const db = tenantDb(event, { as: 'operator', actor: 'operator' })
  let row: AnalyticsSettingsRow | null
  try {
    row = await db.find<AnalyticsSettingsRow>(ANALYTICS_SETTINGS_TABLE)
  }
  catch {
    // Ohne die Zeile wissen wir nicht, ob gemessen wird — „aus" zu behaupten
    // wäre eine Falschaussage, also die ehrlichere: „gerade nicht erreichbar".
    return UNAVAILABLE
  }

  const target = resolveStatsTarget(row, analytics.shared ?? {}, requestHost(event))
  if (target.state === 'off') {
    const off: AnalyticsStatsResponse = { active: false }
    writeAnalyticsStatsCache(event, off)
    return off
  }
  // „Gerade nicht erreichbar" wird BEWUSST nicht gecacht: der Grund ist meist
  // vorübergehend (Instanz weg, Schlüssel gerade nachgetragen), und zwei
  // Minuten künstliche Wartezeit auf eine wieder funktionierende Anzeige wären
  // teurer als fünf Abfragen bei einem erneuten Öffnen der Seite.
  if (target.state === 'unavailable') return UNAVAILABLE

  const baseUrl = (analytics.instance ?? '').replace(/\/+$/, '')
  const apiKey = useRuntimeConfig(event).analyticsStatsApiKey
  if (!baseUrl || !apiKey) return UNAVAILABLE

  const queries = buildStatsQueries(target.siteId, target.filters)

  try {
    // Fünf Abfragen, weil `date_range` für die GANZE Abfrage gilt — „heute" und
    // „30 Tage" lassen sich nicht zusammenlegen. Nebeneinander, damit die Seite
    // nicht fünf Umläufe lang wartet.
    const [today, totals, series, topPages, topSources] = await Promise.all([
      query(baseUrl, apiKey, queries.today),
      query(baseUrl, apiKey, queries.totals),
      query(baseUrl, apiKey, queries.series),
      query(baseUrl, apiKey, queries.topPages),
      query(baseUrl, apiKey, queries.topSources),
    ])

    const response: AnalyticsStatsResponse = {
      active: true,
      today: { visitors: mapVisitors(today) },
      totals: mapTotals(totals),
      series: mapSeries(series),
      topPages: mapNamedCounts(topPages),
      topSources: mapNamedCounts(topSources),
    }
    writeAnalyticsStatsCache(event, response)
    return response
  }
  catch {
    // Der Grund steht schon im Log (s. `query`) — nach außen bleibt es bei
    // „gerade nicht erreichbar", damit nichts über die fremde Instanz durchsickert.
    return UNAVAILABLE
  }
})
