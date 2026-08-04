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
 * `coverAudience.ts` einem abgesagten Termin sein Publikum lässt). Wer einen
 * abgesagten Termin trotzdem aus der Welt nehmen muss, weil der TEXT das Problem
 * ist, kommt heute nicht daran vorbei — das ist eine bewusste Lücke des ersten
 * Schnitts und keine vergessene Zeile.
 */

/** Warum die Moderations-Aktion verweigert wird. `null` = sie ist erlaubt. */
export type EventModerationDenyReason = 'not_visible' | 'not_hidden' | 'cancelled'

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
