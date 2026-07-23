import { deriveHandoffKey, sealHandoffToken } from '../../utils/embedHandoff'
import { sessionCookieName } from '../../lib/appwrite'

/**
 * E2 Embed-Login, Schritt 1 (läuft im POPUP, Top-Level = first-party Cookie):
 * siegelt die aktuelle Session in ein kurzlebiges Handoff-Token, das das
 * Popup per postMessage (targetOrigin = eigene Origin) ans iframe reicht.
 * Gate maui.auth.embedSession (Core-Default aus — nur Apps mit Embed-Feature
 * schalten es an). Details: server/utils/embedHandoff.ts + Embed-Plan § 3a.
 */
export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { maui?: { auth?: { embedSession?: boolean } } }
  if (appConfig.maui?.auth?.embedSession !== true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const secret = getCookie(event, sessionCookieName(event))
  if (!secret) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  return { token: sealHandoffToken(secret, deriveHandoffKey(config.appwriteKey)) }
})
