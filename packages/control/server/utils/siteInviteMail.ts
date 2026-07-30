import type { H3Event } from 'h3'
import type { SiteRole } from '../../shared/types/siteMember'

/**
 * Die Einladungs-Mail in EINE Kunden-Community (studio-019).
 *
 * Der Link zeigt auf den HOST DER COMMUNITY, nicht auf den Kundenbereich: die
 * Mitgliedschaft entsteht dort, und Session-Cookies sind host-gebunden (wer sich
 * auf my.pukalani.app anmeldet, ist auf kunde-a.pukalani.app NICHT eingeloggt).
 * Der Auth-Guard der Seite hängt das Ziel als `?redirect=` an — wer schon ein
 * Konto hat, ist nach dem Anmelden mit EINEM Klick drin; wer keines hat,
 * registriert sich zuerst und landet danach an derselben Stelle. Genau das ist
 * Davids Entscheidung 2: für den Betreiber derselbe Handgriff, egal ob die
 * Person Pukalani schon kennt.
 *
 * Kein Klartext-Token in Logs, keine Rolle im Betreff — die Mail nennt die Rolle
 * im Text, damit die Eingeladene weiß, was sie erwartet.
 */
export interface SiteInviteMailInput {
  to: string
  /** Anzeigename der Community. */
  siteName: string
  /** Kanonischer Host der Community (ohne Schema). */
  host: string
  token: string
  role: SiteRole
  /** Sprache der Mail — die des einladenden Dashboards ('de' | 'en'). */
  locale: string
  /** Name der einladenden Person (leer = weglassen). */
  invitedByName: string
}

const ROLE_LABELS: Record<SiteRole, { de: string, en: string }> = {
  owner: { de: 'Inhaber/in', en: 'owner' },
  admin: { de: 'Administrator/in', en: 'administrator' },
  moderator: { de: 'Moderator/in', en: 'moderator' },
  editor: { de: 'Redakteur/in', en: 'editor' },
  viewer: { de: 'Mitglied', en: 'member' },
}

export async function sendSiteInviteMail(event: H3Event, input: SiteInviteMailInput): Promise<boolean> {
  const scheme = input.host.endsWith('.localhost') || input.host.startsWith('localhost') ? 'http' : 'https'
  const german = input.locale !== 'en'
  // Locale-Prefix von Hand, weil hier kein localePath() existiert (Server-Util,
  // andere App): 'prefix_except_default' heißt /join für en und /de/join für de.
  const path = german ? '/de/join' : '/join'
  const link = `${scheme}://${input.host}${path}?token=${encodeURIComponent(input.token)}`
  const role = ROLE_LABELS[input.role][german ? 'de' : 'en']
  const from = input.invitedByName.trim()

  const subject = german
    ? `Einladung zu „${input.siteName}“`
    : `Invitation to “${input.siteName}”`

  const text = german
    ? [
        from
          ? `${from} lädt dich zu „${input.siteName}“ ein — als ${role}.`
          : `Du bist zu „${input.siteName}“ eingeladen — als ${role}.`,
        '',
        `Einladung annehmen (7 Tage gültig): ${link}`,
        '',
        'Hast du schon ein Pukalani-Konto? Dann genügt ein Klick nach dem Anmelden.',
        'Sonst legst du beim Öffnen des Links ein Konto an und bist danach direkt dabei.',
        '',
        'Die Einladung gilt nur für diese E-Mail-Adresse. Wenn du sie nicht erwartet hast, ignoriere diese Mail.',
      ].join('\n')
    : [
        from
          ? `${from} invites you to “${input.siteName}” as ${role}.`
          : `You have been invited to “${input.siteName}” as ${role}.`,
        '',
        `Accept the invitation (valid for 7 days): ${link}`,
        '',
        'Already have a Pukalani account? One click after signing in is all it takes.',
        'If not, you can create one when you open the link and you are in right afterwards.',
        '',
        'The invitation is tied to this email address. If you did not expect it, simply ignore this email.',
      ].join('\n')

  return sendMail(event, { to: input.to, subject, text }).catch(() => false)
}
