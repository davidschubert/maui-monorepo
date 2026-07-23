import { Account, Client } from 'node-appwrite'
import { z } from 'zod'
import { deriveHandoffKey, openHandoffToken } from '../../utils/embedHandoff'
import { setSessionCookie } from '../../lib/appwrite'

const bodySchema = z.object({ token: z.string().min(1).max(2048) }).strict()

/**
 * E2 Embed-Login, Schritt 2 (läuft im IFRAME, cross-site eingebettet — es hat
 * KEIN first-party Cookie): tauscht das Handoff-Token des Popups gegen das
 * Session-Cookie im CHIPS-Modus (SameSite=None; Secure; Partitioned). Das
 * Secret wird VOR dem Setzen gegen Appwrite validiert (getSession liefert
 * auch das echte Ablaufdatum) — ein manipuliertes/abgelaufenes Token setzt
 * nie ein Cookie. Gate maui.auth.embedSession; Rate-Limit: FAILURE_LIMITED
 * (Token-Raten drosseln, erfolgreiche Handoffs kosten kein Budget).
 */
export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { maui?: { auth?: { embedSession?: boolean } } }
  if (appConfig.maui?.auth?.embedSession !== true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const secret = openHandoffToken(body.token, deriveHandoffKey(config.appwriteKey))
  if (!secret) {
    throw createError({ status: 401, statusText: 'Invalid or expired handoff token' })
  }

  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    .setProject(config.public.appwriteProjectId)
    .setSession(secret)
  const session = await new Account(client).getSession({ sessionId: 'current' }).catch(() => null)
  if (!session) {
    throw createError({ status: 401, statusText: 'Session no longer valid' })
  }

  setSessionCookie(event, secret, session.expire, { partitioned: true })
  return { ok: true }
})
