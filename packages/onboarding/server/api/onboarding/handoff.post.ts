import { z } from 'zod'
import { deriveHandoffKey, sealHandoffToken } from '../../../../core/server/utils/embedHandoff'
import { sessionCookieName } from '../../../../core/server/lib/appwrite'

/**
 * Siegelt die laufende Session für den Sprung auf den Community-Host
 * (O6, Schritt 9 — Gegenstück zu GET /api/auth/site-session).
 *
 * Wird beim KLICK gerufen, nicht beim Seitenaufbau: das Token lebt 60 Sekunden,
 * ein beim Rendern erzeugtes wäre bei einem langsamen Leser längst tot.
 *
 * Ausgegeben wird nur ein Token — der Ziel-Host wird hier NICHT eingebaut, weil
 * jeder Host desselben Deployments dasselbe Siegel öffnen kann; die Seite setzt
 * ihn zusammen.
 */
const bodySchema = z.object({
  /** Nur zur Protokollierung: welche Community geöffnet wird. */
  communityId: z.string().trim().max(36).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const body = await readValidatedBody(event, bodySchema.parse).catch(() => ({ communityId: undefined }))

  const secret = getCookie(event, sessionCookieName(event))
  if (!secret) {
    // Kein Cookie trotz Session-Kontext: dann käme ein Token heraus, das nichts
    // öffnet — lieber ehrlich 401 als ein Link, der beim Kunden scheitert.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  logEvent('info', 'onboarding.handoff_issued', {
    communityId: body.communityId ?? '',
    userId: event.context.user.$id,
  })
  return { token: sealHandoffToken(secret, deriveHandoffKey(config.appwriteKey)) }
})
