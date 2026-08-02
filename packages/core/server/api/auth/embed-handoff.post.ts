import { deriveHandoffKey, handoffAudience, sealHandoffToken } from '../../utils/embedHandoff'
import { sessionCookieName } from '../../lib/appwrite'

/**
 * E2 Embed-Login, Schritt 1 (läuft im POPUP, Top-Level = first-party Cookie):
 * siegelt die aktuelle Session in ein kurzlebiges Handoff-Token, das das
 * Popup per postMessage (targetOrigin = eigene Origin) ans iframe reicht.
 * Gate pukalani.auth.embedSession (Core-Default aus — nur Apps mit Embed-Produkt
 * schalten es an). Details: server/utils/embedHandoff.ts + Embed-Plan § 3a.
 *
 * ZIELGRUPPE = DER EIGENE HOST (Sicherheits-Audit 2026-08-02): Popup und
 * iframe liegen per Konstruktion auf DERSELBEN Origin — das Popup ist unsere
 * Login-Seite mit `?embed=1`, das iframe unsere Embed-Seite. Für diesen Weg
 * ändert die Bindung also nichts außer, dass ein hier gesiegeltes Token auf
 * einem ANDEREN Host des Deployments nun wertlos ist.
 */
export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { pukalani?: { auth?: { embedSession?: boolean } } }
  if (appConfig.pukalani?.auth?.embedSession !== true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const secret = getCookie(event, sessionCookieName(event))
  if (!secret) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const audience = handoffAudience(getHeader(event, 'host'))
  if (!audience) {
    throw createError({ status: 400, statusText: 'Missing host' })
  }

  const config = useRuntimeConfig(event)
  return { token: sealHandoffToken(secret, deriveHandoffKey(config.appwriteKey), audience) }
})
