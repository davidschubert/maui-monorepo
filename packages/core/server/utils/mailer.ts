import { createTransport, type Transporter } from 'nodemailer'
import type { H3Event } from 'h3'

/**
 * SMTP-Mailer (Core): EIN Versandweg für alle E-Mail-Features (Notification-
 * Mails, Digest). Bewusst direktes SMTP statt Appwrite Messaging — kein
 * zusätzlicher Console-Setup/Key-Scope, lokal Mailpit (localhost:1025),
 * in Produktion jeder SMTP-Anbieter. Leerer NUXT_SMTP_HOST = Feature aus;
 * Konsumenten prüfen isMailerConfigured() und senden best-effort.
 */

let cached: { key: string, transporter: Transporter } | null = null

export function isMailerConfigured(event?: H3Event): boolean {
  return Boolean(useRuntimeConfig(event).smtpHost)
}

function getTransporter(event?: H3Event): Transporter | null {
  const config = useRuntimeConfig(event)
  if (!config.smtpHost) return null
  const key = `${config.smtpHost}:${config.smtpPort}:${config.smtpUser}`
  if (cached?.key === key) return cached.transporter
  const port = Number(config.smtpPort) || 587
  const transporter = createTransport({
    host: config.smtpHost,
    port,
    // 465 = implizites TLS; sonst STARTTLS wenn der Server es anbietet
    secure: port === 465,
    ...(config.smtpUser ? { auth: { user: config.smtpUser, pass: config.smtpPass } } : {}),
  })
  cached = { key, transporter }
  return transporter
}

export interface MailInput {
  to: string
  subject: string
  text: string
  /** Optional — ohne html geht die Mail als reiner Text raus */
  html?: string
}

/**
 * Mail senden — wirft bei Fehler (Konsumenten entscheiden über best-effort).
 * Bei unkonfiguriertem SMTP still no-op (false), damit Aufrufer nicht selbst
 * gaten müssen.
 */
export async function sendMail(event: H3Event | undefined, input: MailInput): Promise<boolean> {
  const transporter = getTransporter(event)
  if (!transporter) return false
  const config = useRuntimeConfig(event)
  await transporter.sendMail({
    from: config.smtpFrom || `noreply@${config.smtpHost}`,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  })
  return true
}
