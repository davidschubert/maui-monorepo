import de from '../../i18n/locales/de.json'
import en from '../../i18n/locales/en.json'
import type { NotificationTextLocale } from '../../../core/server/utils/notificationText'

/**
 * ABZEICHEN-TEXTE FÜR DIE MAIL (F1 Teilpaket 2).
 *
 * Eine Abzeichen-Benachrichtigung trägt in `title`/`body` einen i18n-SCHLÜSSEL,
 * keinen fertigen Satz — sie wird in der Glocke (Sprache des Betrachters) und in
 * zwei Mail-Zweigen (Sprache aus `prefs.emailLocale`) gelesen, und ein fertiger
 * Text wäre in mindestens einem davon falsch. Die Glocke übersetzt selbst; der
 * Mail-Zweig läuft auf dem Server ohne i18n-Laufzeit und fragt deshalb diese
 * Auflösung.
 *
 * ── DIESELBE QUELLE WIE DIE OBERFLÄCHE ────────────────────────────────────
 * Gelesen wird die Locale-DATEI dieses Layers, nicht eine zweite Liste daneben.
 * Ein eigenes Server-Wörterbuch wäre eine Kopie, die beim nächsten Umbenennen
 * zurückbleibt — und der Fehler wäre unsichtbar, weil er nur in einer Mail
 * auftaucht, die kaum jemand bekommt.
 *
 * NUR DIESER NAMENSRAUM: alles andere gibt `null` zurück, damit rohe Titel
 * (Absendernamen, Zitate) unangetastet bleiben.
 */
const PREFIX = 'posts.discussions.badges.'

const MESSAGES: Record<NotificationTextLocale, Record<string, unknown>> = { de, en }

/** Einen punktgetrennten Schlüssel im Wörterbuch nachschlagen. */
function lookup(messages: Record<string, unknown>, key: string): string | null {
  let node: unknown = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return null
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : null
}

export default defineNitroPlugin(() => {
  registerNotificationTextResolver('posts', (key, locale) => {
    if (!key.startsWith(PREFIX)) return null
    return lookup(MESSAGES[locale] ?? MESSAGES.en, key)
  })
})
