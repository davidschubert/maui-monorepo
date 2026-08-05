/**
 * DIE BENACHRICHTIGUNG ZU EINER NEUEN NACHRICHT (Konzept § 4) — PUR.
 *
 * ── ZUSAMMENFASSEN STATT FLUTEN ───────────────────────────────────────────
 * Je Konversation EINE Meldung, solange die vorige ungelesen ist. Wer in fünf
 * Minuten sechs Nachrichten bekommt, soll nicht sechsmal geweckt werden.
 *
 * Umgesetzt über den Idempotenz-Schlüssel von `notify()` (`rowId`, 409 ⇒ keine
 * Zeile UND keine Mail, `created: false`) — kein „erst nachsehen, dann
 * schreiben". Der Schlüssel enthält eine ZÄHLMARKE, die beim LESEN weiterrückt:
 * solange der Empfänger nicht hingesehen hat, ergibt jede weitere Nachricht
 * denselben Schlüssel und damit keine zweite Meldung. Hat er gelesen, ist der
 * Schlüssel neu und die nächste Nachricht weckt wieder.
 *
 * ── DIE ZÄHLMARKE IST DIE ZAHL DER GELESENEN RUNDEN ───────────────────────
 * Genommen wird `readRounds` — wie oft dieser Mensch diese Konversation
 * bereits geöffnet hat. Bewusst NICHT der Zeitstempel des letzten Lesens: der
 * ist 24 Zeichen lang, wechselt bei jedem Öffnen und machte den Schlüssel
 * unlesbar; und bewusst nicht der Ungelesen-Zähler, denn der wandert bei jeder
 * neuen Nachricht — dann hätte jede ihren eigenen Schlüssel und die
 * Zusammenfassung wäre keine.
 *
 * ── DIE ID MUSS IN EINE APPWRITE-ROW-ID PASSEN ────────────────────────────
 * Höchstens 36 Zeichen, und das erste darf kein Unterstrich sein. Zwei
 * 20-stellige Ids plus Marke passen NICHT — deshalb ein kurzer, stabiler Hash
 * über die Bestandteile. Er muss nicht kryptografisch sein: eine Kollision
 * hieße „eine Meldung zu wenig", nicht „falscher Empfänger" (der steht als
 * eigenes Feld in der Zeile und entscheidet die Permissions).
 */

/** Der Notification-Typ. Braucht einen Zweig in `messageKey()` + de/en (C17). */
export const MESSAGE_NOTIFICATION_TYPE = 'message.received'

/** Kleiner, stabiler 32-Bit-Hash (FNV-1a) — deterministisch über Prozesse hinweg. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36).padStart(7, '0')
}

export interface MessageNotificationKeyInput {
  conversationId: string
  recipientId: string
  /** Wie oft der Empfänger diese Konversation schon geöffnet hat. */
  readRounds: number
}

/**
 * Der Idempotenz-Schlüssel. Beginnt mit einem Buchstaben (Appwrite verbietet
 * den führenden Unterstrich) und bleibt deutlich unter 36 Zeichen.
 */
export function messageNotificationKey(input: MessageNotificationKeyInput): string {
  const round = Math.max(0, Math.floor(input.readRounds))
  return `m${fnv1a(`${input.conversationId}|${input.recipientId}`)}r${round}`
}

/**
 * Der Ziel-Link der Meldung: der Posteingang mit vorgewählter Konversation.
 *
 * EIN Lese-Ort, zwei Einstiege (Konzept § 1) — aus der Glocke springt man in
 * dieselbe Seite, nicht in eine zweite Ansicht daneben. Der Pfad ist intern
 * und ohne Locale-Präfix; die Glocke guardet ihn ohnehin gegen Open-Redirect.
 */
export function messageNotificationLink(conversationId: string): string {
  return `/dashboard/messages?c=${encodeURIComponent(conversationId)}`
}

/**
 * DIE MAIL TRÄGT DEN NACHRICHTENTEXT NICHT (Konzept § 4, ausdrücklich).
 *
 * Sie sagt, WER geschrieben hat, und verlinkt. Begründung: das Postfach ist
 * ein dritter Ort, an dem der Inhalt landet, und dieser Ort ist nicht der, den
 * der Absender gewählt hat. Wer den Text will, klickt.
 *
 * Deshalb steht hier eine Funktion und keine Vorlage mit `{body}`: `title` ist
 * der Absendername (die Glocke setzt ihn als `{name}` ein), `body` bleibt
 * LEER. Ein „Vorschau-Feld", das später jemand füllt, gäbe es damit gar nicht
 * erst.
 */
export function messageNotificationFields(senderName: string): { title: string, body: string } {
  return { title: senderName, body: '' }
}
