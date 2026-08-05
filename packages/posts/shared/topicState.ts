/**
 * Die Zustände eines Themas — wer darf sie setzen, und wann? (F1 Stufe 3.)
 *
 * PURE (unit-getestet): dieselbe Regel liest die ROUTE (sie ist die Autorität
 * und übersetzt das Urteil in die HTTP-Antwort) und die OBERFLÄCHE (sie blendet
 * aus, was ohnehin abgelehnt würde). Muster wie `postAuthorPolicy.ts` — die
 * Regel steht einmal, nicht zweimal fast gleich.
 *
 * ── DIE DREI ZUSTÄNDE SIND ORTHOGONAL ZU `status` ──────────────────────────
 * `published | hidden | deleted` schließen einander aus, diese drei nicht: ein
 * geschlossenes Thema ist weiterhin veröffentlicht, ein angeheftetes kann
 * zugleich gelöst sein. Die vollständige Begründung (samt der live geprüften
 * Tatsache, dass `status` nur ein varchar ist und die Erweiterung technisch
 * möglich WÄRE) steht im Kopf der Migration posts-011.
 *
 * ── WER DARF WAS ───────────────────────────────────────────────────────────
 * Anheften und Schließen ordnen den Raum für alle und gehören deshalb an
 * `posts.arrange` (bis F1 Teilpaket 3 war das `posts.moderate` — abgespalten,
 * damit die von Hand ernannte Vertrauensstufe 4 die drei Zustände bekommen
 * kann, OHNE Melde-Queue und Ausblenden mitzuerben). „Gelöst" ist etwas
 * anderes — es ist die Antwort auf eine Frage, und die Frage gehört dem, der
 * sie gestellt hat.
 * Deshalb darf sie AUCH der Themen-Autor setzen (Davids Vorgabe: „das ist die
 * Frage-Sicht"). Ein Moderator darf es ebenfalls, sonst bliebe ein Thema für
 * immer ungelöst, dessen Autor die Community verlassen hat.
 *
 * BEWUSST NICHT auf `type: 'question'` eingeschränkt: „gelöst" ist auch für
 * einen gewöhnlichen Beitrag eine sinnvolle Aussage („das Problem ist geklärt"),
 * und eine Einschränkung hier hieße, dass dieselbe Schaltfläche je nach
 * Beitragsart erscheint oder nicht — eine Regel, die niemand erraten kann.
 */

/** Die drei Zustandsfelder. Reihenfolge = Reihenfolge im Menü. */
export const TOPIC_STATE_FIELDS = ['pinned', 'closed', 'solved'] as const
export type TopicStateField = (typeof TOPIC_STATE_FIELDS)[number]

export function isTopicStateField(value: unknown): value is TopicStateField {
  return typeof value === 'string' && (TOPIC_STATE_FIELDS as readonly string[]).includes(value)
}

/** Was die Regel über den Handelnden wissen muss. */
export interface TopicStateActor {
  /** Row-Id des Handelnden; '' = nicht angemeldet. */
  userId: string
  /**
   * Hat er `posts.arrange` in DIESER Community? (Moderator, Admin, Owner —
   * und seit F1 Teilpaket 3 die ernannte Vertrauensstufe 4.)
   *
   * Hieß bis dahin `canModerate` und meinte `posts.moderate`. Der Name wurde
   * mitgezogen, weil er sonst das Gegenteil dessen behauptet hätte, was die
   * Route prüft — und eine Regel, deren Feldname lügt, wird irgendwann falsch
   * benutzt.
   */
  canArrange: boolean
}

/** Was die Regel über das Thema wissen muss. */
export interface TopicStateSubject {
  authorId: string
  /** `community_posts.status` — nur ein veröffentlichtes Thema hat Zustände. */
  status: string
}

export type TopicStateDenial = 'not_allowed' | 'not_published'

export interface TopicStateDecision {
  allowed: boolean
  reason?: TopicStateDenial
}

/**
 * Darf dieser Handelnde dieses Feld an diesem Thema setzen?
 *
 * ZWEI Ablehnungsgründe, und ihre REIHENFOLGE ist Absicht: erst die Rechte
 * (`not_allowed` ⇒ 403), dann der Zustand (`not_published` ⇒ 409). Sonst
 * verriete ein 409 einem Unbefugten, dass es die Zeile gibt und in welchem
 * Zustand sie ist — dieselbe Reihenfolge wie in `decidePostAuthorAction`.
 *
 * `not_published` deckt scheduled, hidden und deleted ab. Ein geplantes Thema
 * anzuheften wäre eine Aussage über etwas, das noch niemand sehen darf; ein
 * ausgeblendetes zu schließen ist gegenstandslos (es nimmt ohnehin keine
 * Kommentare mehr an).
 */
export function decideTopicStateChange(
  field: TopicStateField,
  actor: TopicStateActor,
  subject: TopicStateSubject,
): TopicStateDecision {
  const isAuthor = actor.userId !== '' && actor.userId === subject.authorId
  // „Gelöst" ist die einzige Ausnahme von „wer den Raum ordnet, ordnet ihn".
  const mayTouch = field === 'solved'
    ? (actor.canArrange || isAuthor)
    : actor.canArrange

  if (!mayTouch) return { allowed: false, reason: 'not_allowed' }
  if (subject.status !== 'published') return { allowed: false, reason: 'not_published' }
  return { allowed: true }
}

/**
 * Darf an diesem Thema noch geschrieben werden? (Die Frage, die der
 * comments-Layer über den Core-Vertrag stellt.)
 *
 * PUR und hier, damit dieselbe Antwort die Oberfläche gibt (sie versteckt das
 * Antwortfeld) und der Server (er lehnt ab). Ein geschlossenes Thema nimmt
 * KEINE neuen Kommentare mehr an — bewusst auch nicht von Moderatoren: die
 * öffnen es mit einem Klick wieder, und eine Ausnahme „außer für Moderatoren"
 * hieße, dass die Zusage „geschlossen" für Leser nicht mehr stimmt.
 *
 * Ein NICHT veröffentlichtes Thema ist hier ausdrücklich KEIN Fall: ob ein
 * ausgeblendeter Beitrag Kommentare annimmt, entscheidet die Moderation über
 * die Row-Permissions, nicht dieser Schalter. Diese Funktion beantwortet
 * genau eine Frage, sonst wird sie zur zweiten Moderations-Instanz.
 */
export function topicAcceptsWrites(subject: { closed: boolean }): boolean {
  return !subject.closed
}
