import { isPlausibleScriptId } from '../../../../core/shared/analyticsScript'

/**
 * ADBLOCK-PROXY, HÄLFTE 1 (F47): das Plausible-Script first-party ausliefern.
 * `GET /js/pa-<id>.js` auf dem Community-Host holt `<instanz>/js/pa-<id>.js`
 * und reicht es durch — Adblocker blocken die fremde Herkunft, nicht die
 * eigene. Hälfte 2 (die Events) ist ../api/event.post.ts.
 *
 * KEIN OFFENER PROXY, PER KONSTRUKTION: die Ziel-Basis kommt aus der
 * App-Config (`pukalani.analytics.instance`), aus der URL kommt nur eine Id,
 * die `isPlausibleScriptId` besteht — der Zeichenvorrat kennt weder `.` noch
 * `/` noch `:`, kann also weder eine fremde Herkunft noch einen Pfad benennen.
 *
 * BEWUSST MANUELLES fetch STATT h3-`proxyRequest`: der reicht alle Kopfzeilen
 * außer einer kleinen Blockliste weiter — auch das Session-Cookie. Hier ist
 * die Weitergabe eine ERLAUBNISLISTE: für ein öffentliches Script braucht die
 * Instanz vom Request genau nichts (If-None-Match als einzige Ausnahme, damit
 * Browser-Caches weiter mit 304 bedient werden).
 */

/** Abbruch, bevor eine hängende Instanz Seitenaufbauten blockiert. */
const FETCH_TIMEOUT_MS = 10_000

/** Antwort-Kopfzeilen, die durchgereicht werden — mehr gibt es nicht. */
const PASSED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag'] as const

interface AnalyticsProxyAppConfig {
  instance?: string
  proxy?: boolean
}

export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { pukalani?: { analytics?: AnalyticsProxyAppConfig } }
  const analytics = appConfig.pukalani?.analytics ?? {}
  const instance = (analytics.instance ?? '').replace(/\/+$/, '')
  if (analytics.proxy !== true || !instance) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  const param = getRouterParam(event, 'script') ?? ''
  if (!param.endsWith('.js')) throw createError({ status: 404, statusText: 'Not Found' })
  const scriptId = param.slice(0, -'.js'.length)
  if (!scriptId || !isPlausibleScriptId(scriptId)) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const etag = getHeader(event, 'if-none-match')
    const response = await fetch(`${instance}/js/${scriptId}.js`, {
      signal: controller.signal,
      headers: etag ? { 'if-none-match': etag } : {},
    })
    if (!response.ok && response.status !== 304) {
      // Instanz-Antwort NICHT durchreichen (sie könnte mehr sagen als nötig);
      // ein unbekanntes Script ist aus Sicht dieses Hosts schlicht nicht da.
      throw createError({ status: 404, statusText: 'Not Found' })
    }
    for (const name of PASSED_RESPONSE_HEADERS) {
      const value = response.headers.get(name)
      if (value) setHeader(event, name, value)
    }
    setResponseStatus(event, response.status)
    return response.status === 304 ? null : await response.text()
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    // Instanz weg oder Timeout: die Messung fällt aus, die Seite nicht.
    throw createError({ status: 502, statusText: 'Bad Gateway' })
  }
  finally {
    clearTimeout(timeout)
  }
})
