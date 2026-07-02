import { statusToErrorCode, type MauiErrorResponse } from '../shared/types/error'
import { logEvent, shapeErrorLog } from './utils/logEvent'

/**
 * Nitro-Error-Handler: `/api/`-Fehler kommen als stabiles Envelope
 * `{ ok:false, code, message }` zurück (für externe Konsumenten), ohne
 * Stacktraces/Appwrite-Details (≥500 → generisch).
 *
 * Nicht-API-Fehler werden NICHT angefasst (kein send) → Nitro/Nuxt fällt auf den
 * Standard-Renderer zurück, der die gebrandete error.vue rendert (verifiziert:
 * Browser-Request auf eine fehlende Seite liefert weiterhin die volle HTML-Seite).
 *
 * Observability-Gate (maui.observability): unbehandelte 5xx werden HIER — der
 * zentralen Fehlerstelle — als strukturierte JSON-Zeile geloggt (logEvent).
 * 4xx sind erwartetes Client-Verhalten und bleiben still. Sentry-Andockpunkt:
 * server/utils/logEvent.ts.
 */
export default defineNitroErrorHandler((error, event) => {
  try {
    const gate = useAppConfig().maui?.observability
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
  const body: MauiErrorResponse = { ok: false, code: statusToErrorCode(status), message }
  return send(event, JSON.stringify(body))
})
