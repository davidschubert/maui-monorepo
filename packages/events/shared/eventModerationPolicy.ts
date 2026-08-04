import type { EventStatus } from './types/event'

/**
 * WAS DARF DIE MODERATION MIT EINEM TERMIN? — EINE Regel (F15, 2026-08-03).
 *
 * WARUM SIE PUR IST (Muster `postAuthorPolicy.ts`, `communityTeam.ts`): dieselbe
 * Entscheidung wird an drei Stellen gebraucht — in `hide.post.ts`, in
 * `restore.post.ts` und im Aktions-Menü der Queue. Drei Kopien einer
 * Zustands-Regel sind drei Gelegenheiten, sie auseinanderlaufen zu lassen; genau
 * daran ist die Beitrags-Karte schon einmal vorbeigelaufen (C16). Ohne Nuxt- und
 * Appwrite-Deps, damit Server UND Client dieselbe Quelle lesen.
 *
 * DIE AUTORITÄT BLEIBT DIE ROUTE. Diese Datei entscheidet nichts, sie RECHNET —
 * sie kennt weder Session noch Mandant noch Plan. Die Oberfläche nutzt sie, um
 * keinen Knopf anzubieten, der in ein 409 läuft; durchgesetzt wird sie in
 * `server/api/events/[id]/{hide,restore}.post.ts` hinter der Datentür.
 *
 * WARUM `cancelled` NICHT AUSGEBLENDET WIRD: eine Absage ist die Nachricht, auf
 * die die Zusagenden ein Anrecht haben (dieselbe Begründung, aus der
 * `coverAudience.ts` einem abgesagten Termin sein Publikum lässt).
 *
 * DIE LÜCKE VON F15 IST ZU (F46, 2026-08-03 — Davids Entscheidung). Bis hierher
 * stand hier, wer den TEXT eines abgesagten Termins entfernen muss, komme nicht
 * daran vorbei. Er kommt jetzt: `canRedactEvent` erlaubt das SCHWÄRZEN —
 * Titel und Beschreibung werden geleert, das Titelbild fliegt raus, der Status
 * bleibt `cancelled`. Wer zugesagt hat, sieht weiterhin, DASS abgesagt wurde,
 * nur den Text nicht mehr. VERWORFEN wurde ausdrücklich die Alternative
 * „ausblenden und die Zusagenden benachrichtigen": sie ist teurer (eine Mail je
 * Zusage) und lässt die Absage für alle verschwinden, die die Nachricht nicht
 * lesen — genau der Schaden, den die Regel oben verhindern soll.
 *
 * ZWEI WERKZEUGE, KEINE ÜBERSCHNEIDUNG — je Status gibt es genau eines:
 *   published → AUSBLENDEN. Der Termin steht noch bevor, niemand hat ein
 *               Anrecht darauf, ihn zu sehen; die stärkere Maßnahme ist die
 *               richtige, und sie ist über `restore` umkehrbar.
 *   cancelled → SCHWÄRZEN. Die Nachricht bleibt, der Inhalt geht.
 *   hidden    → nichts zu tun. Der Termin trägt kein Leserecht mehr, den Text
 *               sieht ohnehin niemand außer der Moderation. Schwärzen wäre hier
 *               keine Verbesserung, sondern nur ein zweiter, unumkehrbarer
 *               Eingriff in etwas bereits Unsichtbares.
 *   draft     → nichts zu tun, aus demselben Grund und zusätzlich, weil ein
 *               Entwurf der Redaktion gehört und nie veröffentlicht war.
 */

/** Warum die Moderations-Aktion verweigert wird. `null` = sie ist erlaubt. */
export type EventModerationDenyReason = 'not_visible' | 'not_hidden' | 'cancelled' | 'not_cancelled'

/**
 * Nur ein SICHTBARER Termin kann ausgeblendet werden.
 *
 * `draft` fehlt hier mit Absicht: ein Entwurf trägt ohnehin kein Leserecht,
 * „ausblenden" hätte dort keine Wirkung und würde nur einen Zustand erzeugen, aus
 * dem das Wiederherstellen den Termin fälschlich VERÖFFENTLICHEN würde.
 */
export function canHideEvent(status: EventStatus): { allowed: boolean, reason: EventModerationDenyReason | null } {
  if (status === 'cancelled') return { allowed: false, reason: 'cancelled' }
  if (status !== 'published') return { allowed: false, reason: 'not_visible' }
  return { allowed: true, reason: null }
}

/** Wiederhergestellt wird nur, was auch ausgeblendet IST (sonst 409). */
export function canRestoreEvent(status: EventStatus): { allowed: boolean, reason: EventModerationDenyReason | null } {
  if (status !== 'hidden') return { allowed: false, reason: 'not_hidden' }
  return { allowed: true, reason: null }
}

/**
 * Geschwärzt wird NUR ein abgesagter Termin (F46).
 *
 * Der Deny-Grund ist ein eigener (`not_cancelled`) und nicht das vorhandene
 * `not_visible`: die beiden sagen Verschiedenes. `not_visible` heißt „daran ist
 * nichts zu sehen", `not_cancelled` heißt „für DIESEN Zustand gibt es ein
 * ANDERES Werkzeug" — bei `published` das Ausblenden. Ein gemeinsamer Grund
 * hätte die Oberfläche gezwungen, aus dem Status zurückzurechnen, welchen Satz
 * sie anzeigt; die Sorten der Ablehnung stehen deshalb hier.
 *
 * OHNE `redactedAt`-PRÜFUNG, mit Absicht: diese Funktion kennt nur den Status
 * (wie ihre beiden Geschwister). Ob schon geschwärzt WURDE, ist keine Frage des
 * Zustands, sondern eine der Zeile — dafür gibt es `eventIsRedacted()`. Die
 * Route behandelt den zweiten Aufruf idempotent, statt ihn abzulehnen: eine
 * doppelte Schwärzung ändert nichts, ein 409 wäre nur eine Fehlermeldung für
 * einen bereits erreichten Zustand.
 */
export function canRedactEvent(status: EventStatus): { allowed: boolean, reason: EventModerationDenyReason | null } {
  if (status !== 'cancelled') return { allowed: false, reason: 'not_cancelled' }
  return { allowed: true, reason: null }
}

/**
 * Wurde der Text dieses Termins von der Moderation entfernt? (F46)
 *
 * DER GRUND FÜR DEN MARKER: nach dem Schwärzen sind `title` und `description`
 * LEER, und „leer" allein kann die Oberfläche nicht deuten — sie wüsste nicht,
 * ob da nie etwas stand oder ob jemand es entfernt hat, und zeigte im
 * Zweifel eine tote Fläche. Der Hinweistext gehört in die i18n-Dateien, nicht
 * in die Zeile: die Instanz ist zweisprachig, ein deutscher Satz in der
 * Datenbank wäre für die englische Hälfte der Leser falsch und ließe sich
 * später nicht mehr von echtem Inhalt unterscheiden.
 *
 * Nimmt bewusst den WERT und nicht die Row: so ist die Funktion frei von
 * jedem Typ-Import und kann auch dort gelesen werden, wo nur das Feld vorliegt.
 * `null`/`undefined` (Bestandszeilen vor der Migration) heißt „nicht geschwärzt".
 */
export function eventIsRedacted(redactedAt: string | null | undefined): boolean {
  return typeof redactedAt === 'string' && redactedAt.length > 0
}

/**
 * Darf dieser Termin über das REDAKTIONS-Formular geändert werden?
 *
 * DER GRUND, WARUM ES DIESE FUNKTION GIBT (und nicht nur eine Zeile in der
 * PATCH-Route): `events.manage` hat der EDITOR, `events.moderate` der MODERATOR —
 * zwei Rollen, die sich nicht enthalten. Ohne diese Sperre könnte ein Editor
 * einen ausgeblendeten Termin im Bearbeiten-Dialog auf „Veröffentlicht" stellen
 * und damit die Entscheidung eines Moderators aushebeln, ohne dessen Capability
 * je zu besitzen. Dasselbe Prinzip hält `postAuthorPolicy.ts` fest, wo `hidden`
 * ebenfalls nicht in `EDITABLE_STATUS` steht.
 *
 * `cancelled` war schon vorher gesperrt (die PATCH-Route prüfte es direkt); die
 * Zeile ist hierher gezogen, damit die Frage EINE Antwort hat.
 */
export function eventIsEditable(status: EventStatus): boolean {
  return status !== 'cancelled' && status !== 'hidden'
}

/**
 * Ist der Termin für Nicht-Moderatoren überhaupt sichtbar?
 *
 * Die WAHRHEIT sind auch hier die Row-Permissions (coverAudience.ts) — diese
 * Funktion ist die STATUS-Sicht derselben Frage und dient den Routen, die den
 * Termin mit der OPERATOR-Klinke holen und deshalb an den Permissions
 * vorbeilesen (Bewerten, Kauf). Genau dort war `hidden` sonst ein Loch: die
 * Vote-Route prüfte nur `draft`.
 */
export function eventIsPubliclyVisible(status: EventStatus): boolean {
  return status === 'published' || status === 'cancelled'
}
