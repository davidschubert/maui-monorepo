/**
 * ADBLOCK-PROXY, HÄLFTE 2 (F47): der Event-Einwurf. Das first-party geladene
 * Script (server/routes/js/[script].get.ts) schickt seine Events per
 * `plausible.init({ endpoint: '/api/event' })` an DIESEN Host; hier werden sie
 * an die Instanz weitergereicht. Session-los und öffentlich — genau wie der
 * Einwurf der Instanz selbst; gedrosselt in der zentralen Rate-Limit-
 * Middleware (Bucket `analytics:event`).
 *
 * DIE EINE KOPFZEILE, AN DER ALLES HÄNGT: `X-Forwarded-For` MUSS die echte
 * Besucher-IP tragen — Plausible rechnet daraus (mit dem User-Agent) die
 * Besucher-Zählung, und sein Bot-Filter VERWIRFT STILL, wenn dort die IP
 * unseres Servers steht. Deshalb `trustedClientIp` (das letzte, vom eigenen
 * nginx angehängte Segment — dieselbe Regel wie beim Rate-Limit) als EINZIGER
 * Wert, nie die durchgereichte Kette (deren vordere Segmente sind Behauptung
 * des Aufrufers, und Plausible liest das ERSTE Segment).
 *
 * Weitergabe als ERLAUBNISLISTE (kein h3-`proxyRequest`, der reichte auch das
 * Session-Cookie weiter): Body, Content-Type, User-Agent, Besucher-IP. Mehr
 * braucht der Einwurf nicht.
 */

/** Ein Plausible-Event ist ein kleines JSON — alles darüber ist kein Event. */
const MAX_BODY_BYTES = 8_192

/** Abbruch, bevor eine hängende Instanz Requests sammelt. */
const FETCH_TIMEOUT_MS = 10_000

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

  const declared = Number(getHeader(event, 'content-length') ?? '0')
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) {
    throw createError({ status: 413, statusText: 'Payload Too Large' })
  }
  const raw = await readRawBody(event, false)
  if (!raw || raw.length > MAX_BODY_BYTES) {
    throw createError({ status: 400, statusText: 'Bad Request' })
  }
  // fetch nimmt kein Node-Buffer entgegen (BodyInit) — bei max. 8 KiB ist die
  // Kopie billiger als jede Typ-Verrenkung.
  const body = new Uint8Array(raw)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const ip = trustedClientIp(event)
    const response = await fetch(`${instance}/api/event`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': getHeader(event, 'content-type') ?? 'application/json',
        'user-agent': getHeader(event, 'user-agent') ?? '',
        ...(ip ? { 'x-forwarded-for': ip } : {}),
      },
      body,
    })
    // 202 „ok" im Normalfall; einen Fehlertext der Instanz reichen wir nicht
    // durch (er beschreibt ihr Inneres), der Status genügt dem Script.
    setResponseStatus(event, response.ok ? response.status : 400)
    return response.ok ? await response.text() : ''
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    // Instanz weg oder Timeout: das Script erwartet ohnehin keine Antwort —
    // ein Event geht verloren, die Seite merkt nichts.
    throw createError({ status: 502, statusText: 'Bad Gateway' })
  }
  finally {
    clearTimeout(timeout)
  }
})
