import type { H3Event } from 'h3'
import { type NotificationLinkContext, notificationLinkUrl } from '../../shared/notificationLinks'
import { resolveCommunityHosts } from './communityHost'
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
    // 'badge.awarded': der Titel IST der Abzeichen-Name (als Schlüssel
    // gespeichert, oben übersetzt) — das Label sagt nur, worum es geht.
    types: { reply: 'hat auf deinen Kommentar geantwortet', mention: 'hat dich erwähnt', reminder: 'Erinnerung', ticket: '— Ticket-Update', billing: '— Zahlungsproblem', 'badge.awarded': '— Abzeichen erhalten' },
    fallbackType: 'Neue Benachrichtigung',
    openLink: 'Ansehen',
    digestSubject: count => `${count} neue Benachrichtigung${count === 1 ? '' : 'en'}`,
    digestIntro: count => `Du hast ${count} ungelesene Benachrichtigung${count === 1 ? '' : 'en'}:`,
    footer: 'Du erhältst diese Mail, weil E-Mail-Benachrichtigungen in deinen Einstellungen aktiv sind. Abstellen: Dashboard → Einstellungen → Benachrichtigungen.',
  },
  en: {
    types: { reply: 'replied to your comment', mention: 'mentioned you', reminder: 'Reminder', ticket: '— ticket update', billing: '— payment issue', 'badge.awarded': '— badge earned' },
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

/**
 * Die Link-Basis dieser App (`NUXT_PUBLIC_APP_URL`) — der Fallback, wenn eine
 * Meldung keiner Community gehört oder ihr Host nicht auflösbar ist.
 *
 * Bis D5 (2026-08-01) war das die EINZIGE Basis, und darin lag der Fehler: eine
 * Meldung aus Community A verlinkte auf den App-Host. Wohin ein Eintrag
 * WIRKLICH zeigt, entscheidet jetzt die pure Regel in
 * shared/notificationLinks.ts — pro EINTRAG, nicht pro Mail (eine Digest-Mail
 * mischt Communities).
 */
function appLinkBase(event: H3Event | undefined): string {
  return (useRuntimeConfig(event).public.appUrl || '').replace(/\/+$/, '')
}

export interface NotificationEmailItem {
  type: string
  title: string
  body: string
  link: string
  /**
   * Ablage-Wert der Zeile (`notifications.communityId`): `<communityId>` ·
   * `_account` · `''`. Optional, weil Bestands-Aufrufer ihn nicht kennen —
   * fehlt er, verhält sich der Link wie vor D5 (App-Basis).
   */
  communityId?: string
}

function itemLines(locale: EmailLocale, item: NotificationEmailItem, links: NotificationLinkContext) {
  const copy = COPY[locale]
  const label = copy.types[item.type]
  /**
   * ÜBERSETZBARE TEXTE (F1 Teilpaket 2): steht in `title`/`body` ein
   * i18n-Schlüssel (Abzeichen-Name, Bedingungstext), macht die Registry daraus
   * den Satz in der Mail-Sprache des EMPFÄNGERS. Rohe Inhalte — Absendername,
   * Kommentar-Zitat — erkennt keine Auflösung und sie bleiben unverändert;
   * deshalb darf der Aufruf hier ohne Fallunterscheidung stehen. Er gilt auch
   * für die Digest-Mail, die ihre Einträge aus GESPEICHERTEN Zeilen baut — die
   * einzige Stelle, an der ein fertiger Text nicht mehr zu retten wäre.
   */
  const title = resolveNotificationText(item.title, locale)
  const body = resolveNotificationText(item.body, locale)
  const heading = label ? `${title} ${label}` : `${copy.fallbackType}: ${title}`
  const url = notificationLinkUrl(links, item)
  return {
    heading,
    text: `${heading}\n${body ? `„${body}"\n` : ''}${copy.openLink}: ${url}`,
    html: `<p><strong>${escapeHtml(heading)}</strong><br>${body ? `<em>„${escapeHtml(body)}"</em><br>` : ''}<a href="${escapeHtml(url)}">${copy.openLink}</a></p>`,
  }
}

/** Sofort-Mail für EINE Notification (Modus 'instant'). */
export function buildInstantEmail(links: NotificationLinkContext, locale: EmailLocale, input: NotificationEmailItem): Omit<MailInput, 'to'> {
  const copy = COPY[locale]
  const lines = itemLines(locale, input, links)
  return {
    subject: lines.heading,
    text: `${lines.text}\n\n—\n${copy.footer}`,
    html: `${lines.html}<hr><p style="color:#888;font-size:12px">${escapeHtml(copy.footer)}</p>`,
  }
}

/**
 * Digest-Mail für mehrere ungelesene Notifications (Modus 'digest').
 *
 * JEDER Eintrag bekommt seinen eigenen Host (D5) — das ist hier kein Detail,
 * sondern der Normalfall: der Sweep bündelt bewusst mandantenübergreifend (eine
 * Sammel-Mail pro Tag, nicht eine je Community), eine Mail trägt also Links in
 * mehrere Communities UND in den Kundenbereich nebeneinander.
 */
export function buildDigestEmail(links: NotificationLinkContext, locale: EmailLocale, items: NotificationEmailItem[]): Omit<MailInput, 'to'> {
  const copy = COPY[locale]
  const parts = items.map(item => itemLines(locale, item, links))
  return {
    subject: copy.digestSubject(items.length),
    text: `${copy.digestIntro(items.length)}\n\n${parts.map(p => p.text).join('\n\n')}\n\n—\n${copy.footer}`,
    html: `<p>${escapeHtml(copy.digestIntro(items.length))}</p>${parts.map(p => p.html).join('')}<hr><p style="color:#888;font-size:12px">${escapeHtml(copy.footer)}</p>`,
  }
}

/**
 * Instant-Zweig für notify(): Empfänger laden, Opt-in prüfen, senden.
 * Best-effort — wirft nie (der auslösende Request ist längst beantwortet).
 *
 * `communityId` ist der bereits BERECHNETE Ablage-Wert aus notify() — nicht
 * noch einmal aus dem Request abgeleitet. Ein zweites Mal rechnen hieße, die
 * Regel aus notificationScope.ts zu kopieren, und dann könnten Glocke und Mail
 * unterschiedlich entscheiden.
 *
 * OHNE `H3Event` aufrufbar, weil notify() es seit der Community-Zahlungswarnung
 * ist: die entsteht in einem Intervall-Plugin. Alles, was hier gebraucht wird,
 * kennt diesen Fall schon (`isMailerConfigured`, `createAdminClient`,
 * `useRuntimeConfig`, `sendMail` nehmen `undefined`).
 */
export async function maybeSendInstantEmail(event: H3Event | undefined, input: NotifyInput, communityId: string): Promise<void> {
  try {
    if (!isMailerConfigured(event)) {
      warnMailerMissingOnce('eine Sofort-Benachrichtigung')
      return
    }
    const { users } = createAdminClient(event)
    const recipient = await users.get({ userId: input.recipientId })
    const prefs = resolveEmailPrefs(recipient.prefs as Record<string, unknown>)
    if (prefs.emailNotifications !== 'instant' || !recipient.email) return
    // Spam-Schutz: Mails NUR an verifizierte Adressen — sonst könnte ein
    // Account mit fremder E-Mail Dritten unsere Notifications zustellen.
    if (!recipient.emailVerification) return
    // EINE Community, also ein Resolver-Aufruf — der 60-s-Cache im Resolver
    // trägt die übrigen Antworten desselben Threads.
    const hosts = await resolveCommunityHosts([communityId])
    const mail = buildInstantEmail({ appBase: appLinkBase(event), hosts }, prefs.emailLocale, { ...input, communityId })
    await sendMail(event, { ...mail, to: recipient.email })
  }
  catch (error) {
    console.error('[core] Instant-Notification-Mail fehlgeschlagen:', error)
  }
}
