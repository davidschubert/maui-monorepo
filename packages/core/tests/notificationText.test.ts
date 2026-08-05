import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetNotificationTextResolvers,
  registerNotificationTextResolver,
  resolveNotificationText,
} from '../server/utils/notificationText'

/**
 * ÜBERSETZBARE BENACHRICHTIGUNGS-TEXTE (F1 Teilpaket 2).
 *
 * Der Fall, gegen den das schützt: eine Abzeichen-Mail, in der roh
 * „posts.discussions.badges.name.editor" steht — oder umgekehrt ein
 * Absendername, den eine übereifrige Auflösung verschluckt.
 */
beforeEach(() => {
  __resetNotificationTextResolvers()
})

describe('resolveNotificationText', () => {
  it('lässt stehen, was niemand erkennt — der Normalfall', () => {
    // Fast alle Meldungen tragen rohe Inhalte. Würden sie hier verändert,
    // verlöre die Glocke den Absendernamen.
    registerNotificationTextResolver('posts', key => key === 'a.b' ? 'Treffer' : null)

    expect(resolveNotificationText('Max Mustermann', 'de')).toBe('Max Mustermann')
    expect(resolveNotificationText('', 'de')).toBe('')
  })

  it('übersetzt in der angefragten Sprache', () => {
    registerNotificationTextResolver('posts', (key, locale) => key === 'badge' ? (locale === 'de' ? 'Abzeichen' : 'Badge') : null)

    expect(resolveNotificationText('badge', 'de')).toBe('Abzeichen')
    expect(resolveNotificationText('badge', 'en')).toBe('Badge')
  })

  it('ohne angemeldete Quelle bleibt alles, wie es ist', () => {
    // Silo-App ohne den besitzenden Layer: die Mail geht raus, sie trägt dann
    // den Schlüssel. Verworfen wird sie nie.
    expect(resolveNotificationText('badge', 'de')).toBe('badge')
  })

  it('eine werfende Quelle kostet keine Mail', () => {
    registerNotificationTextResolver('kaputt', () => { throw new Error('weg') })
    registerNotificationTextResolver('heil', key => key === 'badge' ? 'Abzeichen' : null)

    expect(resolveNotificationText('badge', 'de')).toBe('Abzeichen')
  })
})
