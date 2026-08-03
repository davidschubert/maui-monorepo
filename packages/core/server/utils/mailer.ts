import { createTransport, type Transporter } from 'nodemailer'
import type { H3Event } from 'h3'

/**
 * SMTP-Mailer (Core): EIN Versandweg für alle E-Mail-Produkte (Notification-
 * Mails, Digest). Bewusst direktes SMTP statt Appwrite Messaging — kein
 * zusätzlicher Console-Setup/Key-Scope, lokal Mailpit (localhost:1025),
 * in Produktion jeder SMTP-Anbieter. Leerer NUXT_SMTP_HOST = Produkt aus;
 * Konsumenten prüfen isMailerConfigured() und senden best-effort.
 */

let cached: { key: string, transporter: Transporter } | null = null

export function isMailerConfigured(event?: H3Event): boolean {
  return Boolean(useRuntimeConfig(event).smtpHost)
}

let warnedMissingMailer = false

/**
 * „Aus" und „vergessen" sehen identisch aus — deshalb sagt es der Server EINMAL
 * laut, wenn eine GEWOLLTE Mail an der fehlenden Konfiguration stirbt
 * (F44, 2026-08-02).
 *
 * Ohne diesen Hinweis ist ein fehlendes `NUXT_SMTP_HOST` vollkommen still:
 * `isMailerConfigured()` meldet sauber `false`, jeder Konsument überspringt
 * best-effort, kein Log, keine Ausnahme. Genau so lief `apps/platform` in
 * PRODUKTION — für ALLE Kunden-Communities ging nie eine Benachrichtigungs-Mail
 * raus (Antworten, Erwähnungen, Digest, und seit F43 die Zahlungswarnung des
 * Owners), während `comments` und `control` konfiguriert waren. Niemandem fiel
 * es auf, weil Stille wie ein bewusstes „Produkt aus" aussieht.
 *
 * Der ORT ist der Punkt: gewarnt wird da, wo eine konkrete Mail verworfen wird,
 * NICHT in `isMailerConfigured()`. Diese Frage stellt auch der Digest-Sweep beim
 * Start JEDER App — help, marketing und portfolio verschicken bewusst nichts und
 * hätten die Warnung bei jedem Start bekommen. Eine Warnung, die überall steht,
 * wird weggelesen, und dann ist der Ausfall wieder still.
 *
 * Einmal pro Prozess, auf `warn`, ohne den Start zu blockieren: eine App DARF
 * ohne Mailer laufen. Sichtbar sein muss nur der Unterschied.
 */
export function warnMailerMissingOnce(context: string): void {
  if (warnedMissingMailer) return
  warnedMissingMailer = true
  console.warn(`[core] NUXT_SMTP_HOST fehlt — ${context} wurde NICHT verschickt und wird es auch künftig nicht. Beabsichtigt, wenn diese App keine Mails senden soll.`)
}

/** Nur für Tests: Merker leeren. */
export function __resetMailerWarnings(): void {
  warnedMissingMailer = false
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
 * Bei unkonfiguriertem SMTP no-op (false), damit Aufrufer nicht selbst gaten
 * müssen — aber nicht mehr still: der erste verworfene Versuch sagt es einmal
 * laut (F44). Die Adresse steht dabei nur angedeutet im Log, ein Log ist kein
 * Ort für Empfängerlisten.
 */
export async function sendMail(event: H3Event | undefined, input: MailInput): Promise<boolean> {
  const transporter = getTransporter(event)
  if (!transporter) {
    warnMailerMissingOnce(`eine Mail an ${input.to.replace(/(.).*(@.*)/, '$1***$2')}`)
    return false
  }
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
