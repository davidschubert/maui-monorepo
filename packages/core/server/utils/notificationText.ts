/**
 * ÜBERSETZBARE BENACHRICHTIGUNGS-TEXTE (F1 Teilpaket 2).
 *
 * ── DAS PROBLEM ────────────────────────────────────────────────────────────
 * `title`/`body` einer Benachrichtigung sind ROHE Inhalte — ein Absendername,
 * ein Zitat aus einem Kommentar. Die brauchen keine Übersetzung, sie SIND schon
 * der Text. Beim Abzeichen ist es umgekehrt: „Guter Beitrag" ist ein
 * Produktwort, das in jeder Sprache anders heißt, und es wird an DREI Stellen
 * gelesen — in der Glocke (Sprache des Betrachters), in der Sofort-Mail und in
 * der Digest-Mail (Sprache aus `prefs.emailLocale`, oft eine andere). Ein
 * fertiger Text in der Zeile wäre in zweien davon falsch.
 *
 * Also steht in der Zeile der SCHLÜSSEL (`posts.discussions.badges.name.editor`)
 * und übersetzt wird beim Lesen. Die Glocke kann das von selbst (dort liegen
 * alle Wörterbücher der Layer nebeneinander); der Mail-Zweig läuft auf dem
 * Server und hat keine i18n-Laufzeit — dafür gibt es diese Registry.
 *
 * ── WARUM EINE REGISTRY UND NICHT EIN WÖRTERBUCH IN CORE ───────────────────
 * Die Abzeichen-Namen gehören dem posts-Layer (A14). Ein zweites Wörterbuch in
 * core wäre eine Kopie, die beim nächsten Umbenennen zurückbleibt — und core
 * wüsste plötzlich, dass es Abzeichen gibt. Stattdessen meldet der besitzende
 * Layer eine Auflösung an; wer keinen Schlüssel erkennt, gibt `null` zurück.
 *
 * ── UNBEKANNT HEISST UNVERÄNDERT ───────────────────────────────────────────
 * `resolveNotificationText()` gibt den Eingabewert zurück, wenn niemand ihn
 * erkennt. Das ist der Grund, warum der Aufruf bedenkenlos auf JEDEN Titel
 * angewandt werden kann: ein Absendername („Max") ist kein Schlüssel, also
 * erkennt ihn keine Auflösung, also bleibt er stehen.
 */

/** Die Sprachen, in denen Mails gebaut werden (Spiegel von `EmailLocale`). */
export type NotificationTextLocale = 'de' | 'en'

/** Erkennt diese Quelle den Schlüssel? Sonst `null`. */
export type NotificationTextResolver = (
  key: string,
  locale: NotificationTextLocale,
) => string | null

const resolvers = new Map<string, NotificationTextResolver>()

/** Eine Quelle anmelden (Nitro-Plugin des besitzenden Layers), Id = Layer. */
export function registerNotificationTextResolver(id: string, resolver: NotificationTextResolver): void {
  resolvers.set(id, resolver)
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetNotificationTextResolvers(): void {
  resolvers.clear()
}

/**
 * Den Text zu einem Schlüssel — oder den Schlüssel selbst, wenn ihn niemand
 * kennt.
 *
 * Die ERSTE Antwort gewinnt. Zwei Layer, die denselben Schlüssel beanspruchen,
 * gibt es nicht: die Schlüssel tragen den Namensraum ihres Layers.
 */
export function resolveNotificationText(value: string, locale: NotificationTextLocale): string {
  if (!value) return value
  for (const resolver of resolvers.values()) {
    try {
      const text = resolver(value, locale)
      if (text) return text
    }
    catch {
      // Eine kaputte Auflösung darf keine Mail kosten — der Rohwert steht dann
      // da, und das ist immer noch eine zustellbare Mail.
    }
  }
  return value
}
