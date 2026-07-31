import { Account, Client } from 'node-appwrite'
import { z } from 'zod'
import { deriveHandoffKey, openHandoffToken } from '../../utils/embedHandoff'
import { setSessionCookie } from '../../lib/appwrite'

/**
 * Session-Handoff auf einen ANDEREN Host desselben Deployments (O6, Schritt 9).
 *
 * Das Problem: Session-Cookies sind host-only. Wer sich auf
 * `app.pukalani.app` anmeldet und seine frische Community auf
 * `xyz.pukalani.app` öffnet, wäre dort ausgeloggt — obwohl es dieselbe App und
 * dasselbe Appwrite-Projekt ist. Genau dafür existiert der Handoff schon aus
 * dem Embed-Paket (E2): ein kurzlebiges, verschlüsseltes Token statt eines
 * rohen Secrets in der URL-Historie.
 *
 * Ablauf: Kontroll-Host siegelt (POST /api/onboarding/handoff) → dieser Link
 * öffnet auf dem Ziel-Host → Secret wird GEGEN APPWRITE geprüft, erst dann
 * setzt der Server sein eigenes Cookie und leitet weiter.
 *
 * Warum GET (der Rest des Systems benutzt POST für Token-Einlösung): das ist
 * ein Klick-Ziel wie ein Magic-Link. Abgesichert durch: 60-Sekunden-Gültigkeit,
 * Prüfung gegen Appwrite VOR jedem Cookie, Rate-Limit auf Fehlversuche und ein
 * Weiterleitungsziel, das nur ein relativer Pfad sein darf (kein Open Redirect).
 *
 * Gate: nur in Multi-Tenant-Deployments (pukalani.tenancy.enabled) — Single-Tenant-
 * Apps brauchen keinen Host-Wechsel und bekommen die Route nicht.
 */
const querySchema = z.object({
  token: z.string().min(1).max(2048),
  /** Nur ein relativer Pfad — sonst wäre das ein offener Weiterleiter. */
  to: z.string().max(512).regex(/^\/(?!\/)[^\s]*$/).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } }
  if (appConfig.pukalani?.tenancy?.enabled !== true) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const query = await getValidatedQuery(event, querySchema.parse)
  const config = useRuntimeConfig(event)

  const secret = openHandoffToken(query.token, deriveHandoffKey(config.appwriteKey))
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

  setSessionCookie(event, secret, session.expire)
  return sendRedirect(event, query.to ?? '/', 302)
})
