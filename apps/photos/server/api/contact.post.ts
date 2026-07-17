import { z } from 'zod'

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(5).max(2000),
  // Honeypot: für Menschen unsichtbar — ausgefüllt heißt Bot
  website: z.string().max(0).optional().default(''),
}).strict()

/**
 * Kontakt-Formular (P2-Polish, ersetzt den mailto-v1): validiert, drosselt
 * pro IP und schickt die Anfrage per sendMail() (Core-Mailer, lokal Mailpit).
 * Ohne konfiguriertes SMTP antwortet die Route 503 — die Seite fällt dann
 * sichtbar auf die direkte E-Mail-Adresse zurück. Eigener Mini-Limiter statt
 * der Core-Middleware: deren Routenlisten sind Core-Verträge, ein App-
 * Endpoint drosselt sich selbst.
 */
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 3
const attempts = new Map<string, number[]>()

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, contactSchema.parse)

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const now = Date.now()
  const recent = (attempts.get(ip) ?? []).filter(ts => now - ts < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) {
    throw createError({ status: 429, statusText: 'Too many requests' })
  }
  attempts.set(ip, [...recent, now])
  if (attempts.size > 1000) {
    for (const [key, timestamps] of attempts) {
      if (timestamps.every(ts => now - ts >= WINDOW_MS)) attempts.delete(key)
    }
  }

  // Honeypot gefüllt → Bot: still schlucken (kein Signal nach außen)
  if (body.website) return { ok: true }

  if (!isMailerConfigured(event)) {
    throw createError({ status: 503, statusText: 'Contact mail is not configured' })
  }

  const config = useRuntimeConfig(event)
  const sent = await sendMail(event, {
    to: config.contactEmail,
    subject: `Enquiry via maui.photos — ${body.name}`,
    text: `${body.message}\n\n— ${body.name} <${body.email}>`,
  }).catch(() => false)

  if (!sent) {
    throw createError({ status: 502, statusText: 'Could not send message' })
  }
  return { ok: true }
})
