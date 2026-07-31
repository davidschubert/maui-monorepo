import { domainReasonFrom, statusToErrorCode, type PukalaniErrorResponse } from '../shared/types/error'
import { logEvent, shapeErrorLog } from './utils/logEvent'

/**
 * Nitro-Error-Handler: `/api/`-Fehler kommen als stabiles Envelope
 * `{ ok:false, code, message }` zurück (für externe Konsumenten), ohne
 * Stacktraces/Appwrite-Details (≥500 → generisch).
 *
 * Nicht-API-Fehler beantwortet dieser Handler BEWUSST nicht (kein send) —
 * dann übernimmt der NÄCHSTE Handler der Nitro-Kette: der von Nuxt
 * mitgelieferte, der die gebrandete error.vue (CoreErrorPage) rendert.
 *
 * WICHTIG — warum die Kette explizit in nuxt.config.ts gebaut wird
 * (Audit-Befund B2, 2026-07-27): `nitro.errorHandler` in der nuxt.config
 * ERSETZT Nuxts eigenen Handler, statt ihn zu ergänzen. @nuxt/nitro-server
 * 4.4.8 registriert seinen Renderer-Handler nur, wenn das Feld noch leer ist
 * (`if (!nitroConfig.errorHandler && …) nitroConfig.errorHandler =
 * resolve(distDir, 'runtime/handlers/error')`, dist/index.mjs:402). Weil der
 * Core das Feld gesetzt hatte, blieb in nitropack 2.13.4 nur noch
 * `[dieser Handler, internal/error/prod]` in der Kette — und
 * `internal/error/prod` antwortet AUSNAHMSLOS mit
 * `{"error":true,"url":…,"statusCode":404,…}` als `application/json`
 * (dist/runtime/internal/error/prod.mjs), auch bei `Accept: text/html`.
 * Ergebnis: es gab faktisch KEINE 404-Seite, obwohl jede App eine
 * app/error.vue hat. Seit dem Fix hängt dieser Handler VOR Nuxts Handler
 * (`nitro:config`-Hook in packages/core/nuxt.config.ts) — die Kette lautet
 * `[dieser Handler, Nuxt-Renderer, internal/error/prod]`, und wer zuerst
 * antwortet (event.handled), beendet sie. Also: `nitro.errorHandler` hier
 * NIE wieder direkt in der nuxt.config setzen.
 *
 * Bewusst UNVERÄNDERT gelassen: Nuxts Handler überlässt „JSON-Clients" das
 * Feld (isJsonRequest — `Accept: application/json`, `.json`, `/api/`, UA
 * curl/httpie, sec-fetch-mode: cors). Ein nacktes `curl <seite>` sieht daher
 * weiterhin Nitros Debug-JSON; Browser, Crawler und alles mit
 * `Accept: text/html` bekommen die HTML-Seite. Das ist Nitro/Nuxt-
 * Standardverhalten (Content-Negotiation), keine Regression.
 *
 * Observability-Gate (pukalani.observability): unbehandelte 5xx werden HIER — der
 * zentralen Fehlerstelle — als strukturierte JSON-Zeile geloggt (logEvent).
 * 4xx sind erwartetes Client-Verhalten und bleiben still. Sentry-Andockpunkt:
 * server/utils/logEvent.ts.
 */
export default defineNitroErrorHandler((error, event) => {
  try {
    const gate = useAppConfig().pukalani?.observability
    if (gate?.enabled) {
      const shaped = shapeErrorLog(error, { path: event.path, method: event.method })
      if (typeof shaped.status === 'number' && shaped.status >= 500) {
        logEvent('error', 'server.error', shaped)
      }
    }
  }
  catch {
    // Logging darf nie selbst zum Fehler werden
  }

  if (!event.path?.startsWith('/api/')) return

  const status = error.statusCode || 500
  setResponseStatus(event, status, error.statusMessage)
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  const message = status >= 500 ? 'Internal server error' : (error.statusMessage || 'Error')
  // Fachlicher Grund (4xx): EIN geprüfter Schlüssel aus error.data.code, sonst
  // nichts. Ohne ihn kann eine Oberfläche „es muss ein Inhaber bleiben" nicht von
  // „irgendwas ging schief" unterscheiden — die restliche `data` bleibt bewusst
  // draußen (keine Appwrite-Details).
  const reason = status < 500 ? domainReasonFrom((error as { data?: unknown }).data) : null
  const body: PukalaniErrorResponse = {
    ok: false,
    code: statusToErrorCode(status),
    message,
    ...(reason ? { reason } : {}),
  }
  return send(event, JSON.stringify(body))
})
