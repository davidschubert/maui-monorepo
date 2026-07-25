import type { H3Event } from 'h3'

/**
 * Die Einladungs-Mail (studio-017).
 *
 * Enthält BEIDES: den Direktlink (Feld vorbefüllt) und den Code zum Abtippen.
 * Tippen ist die häufigste Abbruchstelle bei Codes, und ein Link allein
 * scheitert, sobald jemand die Mail auf dem Telefon liest und am Rechner
 * weitermacht.
 *
 * Bei einer Erinnerung sagt die Mail ausdrücklich, dass dieser Code den
 * vorherigen ERSETZT — sonst probiert jemand den alten und hält uns für kaputt.
 */
export interface InviteMailInput {
  to: string
  code: string
  locale: string
  reminder: boolean
}

export async function sendInviteMail(event: H3Event, input: InviteMailInput): Promise<boolean> {
  const config = useRuntimeConfig(event) as { onboardingStartUrl?: string }
  // Der Trichter lebt auf dem Kundenbereich-Host, nicht im Studio — die URL
  // kommt deshalb aus der Env und nicht aus public.appUrl.
  const startUrl = (config.onboardingStartUrl || 'https://app.pukalani.app/start').replace(/\/+$/, '')
  const link = `${startUrl}?code=${encodeURIComponent(input.code)}`
  const german = input.locale !== 'en'

  const subject = german
    ? (input.reminder ? 'Dein Pukalani-Einladungs-Code (neu)' : 'Deine Einladung zu Pukalani')
    : (input.reminder ? 'Your Pukalani invite code (new)' : 'Your invitation to Pukalani')

  const text = german
    ? [
        input.reminder
          ? 'hier ist ein neuer Einladungs-Code für Pukalani. Er ERSETZT den vorherigen — der alte funktioniert nicht mehr.'
          : 'du bist eingeladen, deine Community mit Pukalani zu starten.',
        '',
        `Direkt loslegen: ${link}`,
        '',
        `Oder den Code selbst eintragen: ${input.code}`,
        '',
        'Der Code gilt für diese E-Mail-Adresse und kann einmal eingelöst werden.',
        '',
        'Wenn du das nicht angefragt hast, ignoriere diese Mail einfach.',
      ].join('\n')
    : [
        input.reminder
          ? 'here is a new invite code for Pukalani. It REPLACES the previous one — the old code no longer works.'
          : 'you are invited to start your community with Pukalani.',
        '',
        `Get started: ${link}`,
        '',
        `Or enter the code yourself: ${input.code}`,
        '',
        'The code is tied to this email address and can be redeemed once.',
        '',
        'If you did not request this, simply ignore this email.',
      ].join('\n')

  return sendMail(event, { to: input.to, subject, text }).catch(() => false)
}
