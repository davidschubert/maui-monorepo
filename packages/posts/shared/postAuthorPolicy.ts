import type { PostStatus, PostType } from './types/post'

/**
 * WAS DARF DER AUTOR MIT SEINEM EIGENEN BEITRAG? — EINE Regel (C16).
 *
 * WARUM ES SIE GIBT: dieselbe Entscheidung stand dreimal ausgeschrieben da —
 * in `[id].patch.ts` (Autor + Status + Poll-Sperre), in `[id].delete.ts`
 * (Autor + Idempotenz) und im `PostCard.vue`-Menü (`isAuthor` + „keine Polls
 * bearbeiten"). Drei Kopien einer Regel sind drei Gelegenheiten, sie
 * auseinanderlaufen zu lassen: die Karte kannte die Status-Bedingung gar
 * nicht, der Server die vereinfachte Poll-Sicht der Karte nicht. Hier steht
 * sie einmal, pur und ohne Nuxt-/Appwrite-Deps, damit Server UND Client
 * dieselbe Quelle lesen (Muster `communityAuthz.ts`, `communityTeam.ts`).
 *
 * DIE AUTORITÄT BLEIBT DIE ROUTE. Diese Funktion entscheidet nichts, sie
 * RECHNET — sie kennt weder Session noch Mandant noch Wartungsmodus. Die UI
 * nutzt sie, um keinen Knopf anzubieten, der in ein 403/409 läuft; die
 * Durchsetzung passiert weiter in `server/api/posts/[id].*`, hinter der
 * Datentür und dem Produkt-Gate.
 *
 * DIE POLL-SPERRE HAT ZWEI SICHTEN, und beide sind hier abgebildet:
 *  - Server: er KANN die fremden Stimmen zählen → `hasForeignPollVotes`
 *    entscheidet exakt (eine Umfrage ohne fremde Stimme bleibt änderbar).
 *  - Client: er kann es nicht (die Vote-Rows tragen keine breite
 *    Leseberechtigung) → ohne das Feld gilt eine Umfrage als GESPERRT. Das ist
 *    die konservative Sicht: lieber einen erlaubten Knopf verschweigen als
 *    einen anbieten, der scheitert. Genau das tat das Karten-Menü schon vorher
 *    („Bearbeiten" nie bei `type === 'poll'`) — nur eben als eigene Kopie.
 *
 * Warum die Frage unter abgegebenen Stimmen eingefroren ist: die Frage nach
 * dem Abstimmen zu ändern wäre Manipulations-Fläche (Plan §4).
 */

/** Warum das Bearbeiten verweigert wird. `null` = es ist erlaubt. */
export type PostAuthorDenyReason = 'not_author' | 'not_editable' | 'poll_locked'

export interface PostAuthorActionInput {
  /** Appwrite-User-Id des Verfassers (`CommunityPost.authorId`) */
  authorId: string
  status: PostStatus
  type: PostType
  /**
   * Gibt es Stimmen von ANDEREN auf dieser Umfrage? `undefined` = ungezählt
   * (Client-Sicht) und wird wie „ja" behandelt. Für Nicht-Umfragen egal.
   */
  hasForeignPollVotes?: boolean
}

export interface PostAuthorDecision {
  /**
   * Ist der Anfragende der Verfasser? Bewusst ein eigenes Feld und nicht aus
   * `canDelete` abgelesen: „Autorschaft" ist die Tatsache, „darf löschen" nur
   * eine heutige Folge davon — die UI unterscheidet zwischen den eigenen
   * Aktionen und dem „Melden" für Fremde, und das soll nicht kippen, wenn
   * das Löschen einmal weitere Bedingungen bekommt.
   */
  isAuthor: boolean
  canEdit: boolean
  canDelete: boolean
  /** Grund gegen das BEARBEITEN (Löschen scheitert nur an `not_author`). */
  reason: PostAuthorDenyReason | null
}

/** Nur in diesen Status ist ein Beitrag inhaltlich änderbar. */
const EDITABLE_STATUS: readonly PostStatus[] = ['published', 'scheduled']

/**
 * Die Regel. `userId` darf leer/fehlend sein (Gast) — dann ist niemand Autor,
 * auch dann nicht, wenn `authorId` selbst leer wäre.
 */
export function decidePostAuthorAction(
  input: PostAuthorActionInput,
  userId: string | null | undefined,
): PostAuthorDecision {
  const isAuthor = Boolean(userId) && input.authorId === userId
  if (!isAuthor) {
    return { isAuthor: false, canEdit: false, canDelete: false, reason: 'not_author' }
  }

  // Löschen darf der Autor IMMER — auch einen bereits gelöschten Beitrag:
  // die Route antwortet dann idempotent { ok: true } statt mit einem Fehler.
  const base = { isAuthor: true, canDelete: true } as const

  if (!EDITABLE_STATUS.includes(input.status)) {
    return { ...base, canEdit: false, reason: 'not_editable' }
  }

  // undefined = ungezählt ⇒ gesperrt (Client-Sicht, s. Kopfkommentar)
  if (input.type === 'poll' && input.hasForeignPollVotes !== false) {
    return { ...base, canEdit: false, reason: 'poll_locked' }
  }

  return { ...base, canEdit: true, reason: null }
}
