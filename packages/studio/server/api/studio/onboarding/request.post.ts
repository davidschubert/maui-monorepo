import { z } from 'zod'
import { notifyOperators, upsertRequest } from '../../../utils/inviteRequests'
import { requireOnboardingCaller } from '../../../utils/onboardingService'

/**
 * Early-Access-Anfrage annehmen (studio-017) — gerufen von der Platform-App,
 * die das öffentliche Formular hält.
 *
 * Session-los mit Absicht: hier fragt jemand an, der noch KEIN Konto hat. Die
 * Absicherung liegt deshalb woanders — Service-Secret (der Aufrufer ist unser
 * Deployment), Rate-Limit + Honeypot auf der öffentlichen Seite, und die
 * Adresse ist eindeutig (uq_email), sodass Wiederholungen keine Dubletten
 * erzeugen.
 *
 * Antwortet IMMER gleich (ok: true) — ob eine Adresse schon angefragt hat,
 * geht niemanden etwas an, der es nur ausprobiert.
 */
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  note: z.string().trim().max(500).optional(),
  locale: z.enum(['de', 'en']).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const { request, created } = await upsertRequest(event, {
    email: body.email,
    note: body.note ?? '',
    locale: body.locale ?? 'de',
  })

  // Nur bei einer NEUEN Anfrage stören — sonst wird jeder Doppelklick zur Mail.
  if (created) await notifyOperators(event, request)

  logEvent('info', 'invite.requested', { requestId: request.$id, created })
  return { ok: true }
})
