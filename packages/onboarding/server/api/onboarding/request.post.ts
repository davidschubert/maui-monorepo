import { z } from 'zod'
import { callControlPlane } from '../../utils/controlPlane'

/**
 * Early Access anfragen — die einzige Route dieses Layers OHNE Session: hier
 * meldet sich jemand, der noch kein Konto hat.
 *
 * Drei Bremsen statt einer Anmeldung:
 *  - Rate-Limit (core-Middleware, 3/min und IP — die Route verschickt Mail),
 *  - Honeypot: ein für Menschen unsichtbares Feld. Ist es gefüllt, war es ein
 *    Bot; wir antworten trotzdem freundlich (ok), damit er nicht lernt,
 *    woran es lag, und schreiben nichts.
 *  - eindeutige Adresse im Control Plane (uq_email) — Wiederholungen erzeugen
 *    keine Dubletten.
 *
 * Die Antwort ist IMMER dieselbe. Ob eine Adresse schon angefragt hat, ist
 * eine Information über eine fremde Person — die gibt diese Route nicht preis.
 */
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  note: z.string().trim().max(500).optional(),
  locale: z.enum(['de', 'en']).optional(),
  /** Honeypot — muss leer bleiben. Heißt bewusst harmlos. */
  website: z.string().max(200).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.website) {
    logEvent('info', 'invite.request_honeypot', {})
    return { ok: true }
  }

  await callControlPlane(event, '/api/control/onboarding/request', {
    email: body.email,
    note: body.note ?? '',
    locale: body.locale ?? 'de',
  })

  return { ok: true }
})
