/**
 * WER DARF WELCHES FELD EINES FREMDEN BEITRAGS ÄNDERN? (F1 Teilpaket 3.)
 *
 * PURE und unit-getestet — dieselbe Regel liest die ROUTE (`[id].patch.ts`, sie
 * bleibt die Autorität und übersetzt das Urteil in die HTTP-Antwort) und die
 * OBERFLÄCHE (sie bietet keinen Knopf an, der in ein 403 läuft). Muster
 * `postAuthorPolicy.ts` und `topicState.ts`.
 *
 * ── WARUM ES SIE NEBEN `decidePostAuthorAction` GIBT ──────────────────────
 * Die alte Regel beantwortet EINE Frage: „darf der Verfasser das noch?" (Autor,
 * Status, Poll-Sperre). Sie kennt bewusst keinen Moderator — und genau deshalb
 * konnte bis hierher NIEMAND einen fremden Titel korrigieren. Davids v1-Rechte
 * geben das jetzt zwei Stufen, und zwar unterschiedlich fein:
 *
 *   Stufe 3 (`posts.curate`) → Titel und Einordnung. Die HÜLLE.
 *   Stufe 4 (`posts.revise`) → zusätzlich der TEXT.
 *
 * Ein einzelnes Ja/Nein kann das nicht ausdrücken. Deshalb antwortet diese
 * Regel FELDWEISE — und deshalb fragt die Route auch feldweise: geprüft wird
 * nur, was sich TATSÄCHLICH ändert. Das Formular schickt Titel und Text bei
 * jedem Speichern mit; ein Kurator, der nur die Kategorie wechselt, dürfte
 * daran nicht scheitern (dieselbe Überlegung, aus der `postContentEdited` den
 * „bearbeitet"-Stempel nur bei echter Änderung setzt).
 *
 * ── DER AUTOR BEHÄLT ALLES ────────────────────────────────────────────────
 * Er darf jedes Feld — unverändert und ohne jede neue Bedingung. Diese Regel
 * ERWEITERT nach unten (Davids Vorgabe: „TL erweitert nur nach unten, nimmt nie
 * etwas weg"); wer vorher durchkam, kommt weiter durch.
 *
 * ── STATUS UND POLL-SPERRE GELTEN FÜR ALLE ────────────────────────────────
 * Sie stehen bewusst NICHT hier, sondern bleiben in `decidePostAuthorAction`
 * und werden von der Route für JEDEN Bearbeitenden ausgewertet. Ein Kurator
 * soll einen ausgeblendeten Beitrag so wenig anfassen wie sein Verfasser, und
 * die Frage einer laufenden Umfrage bleibt eingefroren, egal wer tippt — die
 * Manipulations-Fläche wird nicht kleiner, wenn ein anderer sie öffnet.
 */

/** Die Felder, um die es geht. Reihenfolge = Reihenfolge im Formular. */
export const POST_EDIT_FIELDS = ['title', 'body', 'categoryId'] as const
export type PostEditField = (typeof POST_EDIT_FIELDS)[number]

/** Was die Regel über den Handelnden wissen muss. */
export interface PostEditActor {
  /** Ist er der Verfasser? */
  isAuthor: boolean
  /** Hat er `posts.curate`? (Stufe 3, Moderator, Admin, Owner) */
  canCurate: boolean
  /** Hat er `posts.revise`? (Stufe 4, Admin, Owner) */
  canRevise: boolean
}

/**
 * PURE: Darf dieser Handelnde DIESES Feld ändern?
 *
 * Der Autor darf alles. Sonst entscheidet das Feld: die Hülle (Titel,
 * Einordnung) braucht `posts.curate`, der Text braucht `posts.revise`. Wer
 * `posts.revise` hat, darf auch die Hülle — ein Recht am Text, das nicht
 * erlaubt, den Titel mitzuziehen, wäre in der Praxis keines.
 */
export function mayEditPostField(field: PostEditField, actor: PostEditActor): boolean {
  if (actor.isAuthor) return true
  if (field === 'body') return actor.canRevise
  return actor.canCurate || actor.canRevise
}

/**
 * PURE: Sind ALLE tatsächlich geänderten Felder erlaubt?
 *
 * `changed` ist die Liste dessen, was sich WIRKLICH unterscheidet — nicht, was
 * das Formular mitgeschickt hat. Eine leere Liste ist erlaubt: ein Speichern
 * ohne Änderung ist kein Rechtsakt, und es 403 zu geben wäre eine Ablehnung für
 * nichts.
 */
export function mayEditPostFields(changed: readonly PostEditField[], actor: PostEditActor): boolean {
  return changed.every(field => mayEditPostField(field, actor))
}

/**
 * PURE: Darf dieser Handelnde diesen Beitrag ÜBERHAUPT anfassen?
 *
 * Die Frage, die die Oberfläche stellt, bevor sie ein Menü öffnet — und die
 * Route, bevor sie die teureren Prüfungen macht. „Irgendein Feld" reicht: was
 * genau, entscheidet sich danach.
 */
export function mayEditPost(actor: PostEditActor): boolean {
  return POST_EDIT_FIELDS.some(field => mayEditPostField(field, actor))
}
