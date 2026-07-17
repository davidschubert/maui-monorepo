import type { H3Event } from 'h3'
import type { NotifyInput } from './notify'

/**
 * E-Mail-Zweig der Notifications (OPEN-ITEMS Idee 1): Bell-Notifications
 * zusätzlich per Mail — sofort ('instant') oder gesammelt ('digest', Sweep in
 * server/plugins/email-digest.ts). Opt-in über prefs.emailNotifications
 * (Default 'off', Settings → Benachrichtigungen); die Mail-Sprache ist die
 * UI-Sprache beim Speichern der Präferenz (prefs.emailLocale, Fallback en).
 *
 * title/body der Notifications sind ROHE Inhalte (Absendername + Snippet);
 * das Typ-Label liefert das Wörterbuch hier — Server-Pendant zur Bell.
 */

export type EmailNotificationMode = 'off' | 'instant' | 'digest'
export type EmailLocale = 'de' | 'en'

export interface NotificationEmailPrefs {
  emailNotifications?: EmailNotificationMode
  emailLocale?: EmailLocale
  emailDigestLastAt?: string
}

const COPY: Record<EmailLocale, {
  types: Record<string, string>
  fallbackType: string
  openLink: string
  digestSubject: (count: number) => string
  digestIntro: (count: number) => string
  footer: string
}> = {
  de: {
    types: { reply: 'hat auf deinen Kommentar geantwortet', mention: 'hat dich erwähnt', reminder: 'Erinnerung', ticket: '— Ticket-Update', billing: '— Zahlungsproblem' },
    fallbackType: 'Neue Benachrichtigung',
    openLink: 'Ansehen',
    digestSubject: count => `${count} neue Benachrichtigung${count === 1 ? '' : 'en'}`,
    digestIntro: count => `Du hast ${count} ungelesene Benachrichtigung${count === 1 ? '' : 'en'}:`,
    footer: 'Du erhältst diese Mail, weil E-Mail-Benachrichtigungen in deinen Einstellungen aktiv sind. Abstellen: Dashboard → Einstellungen → Benachrichtigungen.',
  },
  en: {
    types: { reply: 'replied to your comment', mention: 'mentioned you', reminder: 'Reminder', ticket: '— ticket update', billing: '— payment issue' },
    fallbackType: 'New notification',
    openLink: 'View',
    digestSubject: count => `${count} new notification${count === 1 ? '' : 's'}`,
    digestIntro: count => `You have ${count} unread notification${count === 1 ? '' : 's'}:`,
    footer: 'You receive this email because email notifications are enabled in your settings. Turn off: Dashboard → Settings → Notifications.',
  },
}

export function resolveEmailPrefs(prefs: Record<string, unknown> | undefined | null): Required<Pick<NotificationEmailPrefs, 'emailNotifications' | 'emailLocale'>> & { emailDigestLastAt: string } {
  const mode = prefs?.emailNotifications
  const locale = prefs?.emailLocale
  return {
    emailNotifications: mode === 'instant' || mode === 'digest' ? mode : 'off',
    emailLocale: locale === 'de' ? 'de' : 'en',
    emailDigestLastAt: typeof prefs?.emailDigestLastAt === 'string' ? prefs.emailDigestLastAt : '',
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

/** Interner Link → absolute URL (NUXT_PUBLIC_APP_URL); Guard wie NotificationBell. */
function absoluteLink(event: H3Event | undefined, link: string): string {
  const appUrl = (useRuntimeConfig(event).public.appUrl || '').replace(/\/$/, '')
  const safe = /^\/(?![/\\%])[^\s\\]*$/.test(link) ? link : '/'
  return `${appUrl}${safe}`
}

export interface NotificationEmailItem {
  type: string
  title: string
  body: string
  link: string
}

function itemLines(locale: EmailLocale, item: NotificationEmailItem, event?: H3Event) {
  const copy = COPY[locale]
  const label = copy.types[item.type]
  const heading = label ? `${item.title} ${label}` : `${copy.fallbackType}: ${item.title}`
  const url = absoluteLink(event, item.link)
  return {
    heading,
    text: `${heading}\n${item.body ? `„${item.body}"\n` : ''}${copy.openLink}: ${url}`,
    html: `<p><strong>${escapeHtml(heading)}</strong><br>${item.body ? `<em>„${escapeHtml(item.body)}"</em><br>` : ''}<a href="${escapeHtml(url)}">${copy.openLink}</a></p>`,
  }
}

/** Sofort-Mail für EINE Notification (Modus 'instant'). */
export function buildInstantEmail(event: H3Event | undefined, locale: EmailLocale, input: NotificationEmailItem): Omit<MailInput, 'to'> {
  const copy = COPY[locale]
  const lines = itemLines(locale, input, event)
  return {
    subject: lines.heading,
    text: `${lines.text}\n\n—\n${copy.footer}`,
    html: `${lines.html}<hr><p style="color:#888;font-size:12px">${escapeHtml(copy.footer)}</p>`,
  }
}

/** Digest-Mail für mehrere ungelesene Notifications (Modus 'digest'). */
export function buildDigestEmail(event: H3Event | undefined, locale: EmailLocale, items: NotificationEmailItem[]): Omit<MailInput, 'to'> {
  const copy = COPY[locale]
  const parts = items.map(item => itemLines(locale, item, event))
  return {
    subject: copy.digestSubject(items.length),
    text: `${copy.digestIntro(items.length)}\n\n${parts.map(p => p.text).join('\n\n')}\n\n—\n${copy.footer}`,
    html: `<p>${escapeHtml(copy.digestIntro(items.length))}</p>${parts.map(p => p.html).join('')}<hr><p style="color:#888;font-size:12px">${escapeHtml(copy.footer)}</p>`,
  }
}

/**
 * Instant-Zweig für notify(): Empfänger laden, Opt-in prüfen, senden.
 * Best-effort — wirft nie (der auslösende Request ist längst beantwortet).
 */
export async function maybeSendInstantEmail(event: H3Event, input: NotifyInput): Promise<void> {
  try {
    if (!isMailerConfigured(event)) return
    const { users } = createAdminClient(event)
    const recipient = await users.get({ userId: input.recipientId })
    const prefs = resolveEmailPrefs(recipient.prefs as Record<string, unknown>)
    if (prefs.emailNotifications !== 'instant' || !recipient.email) return
    const mail = buildInstantEmail(event, prefs.emailLocale, input)
    await sendMail(event, { ...mail, to: recipient.email })
  }
  catch (error) {
    console.error('[core] Instant-Notification-Mail fehlgeschlagen:', error)
  }
}
