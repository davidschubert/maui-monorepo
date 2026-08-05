/**
 * WAS ÄNDERT EINE STIMME AN DEN ZÄHLERN? (F1, mitschreibende Zähler.)
 *
 * PURE und unit-getestet, und sie liegt in `core/shared`, weil GENAU DIESELBE
 * Rechnung an zwei Stellen gebraucht wird: `posts/[id]/score.post.ts` und
 * `comments/[id]/vote.post.ts`. Beide Layer dürfen einander nicht kennen (A14),
 * und eine zweimal hingeschriebene Vorzeichen-Regel ist die Sorte Dopplung, die
 * beim nächsten Sonderfall auseinanderläuft — an einer Stelle wird sie
 * korrigiert, an der anderen nicht, und dann zählt der Feed anders als die
 * Antworten.
 *
 * ── DIE REGEL: NUR AUFSTIMMEN ZÄHLEN (Davids Entscheidung 4) ────────────────
 * „Like" ist im Abzeichen-Katalog das UPVOTE. Eine Abstimme ist
 * abzeichen-neutral und bewegt hier deshalb gar nichts — auch nicht negativ.
 * Gezählt wird die VERÄNDERUNG des Zustands „hat aufgestimmt":
 *
 *   vorher      nachher     Ergebnis
 *   ─────────────────────────────────
 *   nichts   →  auf         +1
 *   ab       →  auf         +1   (die Abstimme war nie gezählt)
 *   auf      →  nichts      −1
 *   auf      →  ab          −1
 *   alles andere                 0
 *
 * ── WARUM ZUSTAND → ZUSTAND UND NICHT „WAS WURDE GEKLICKT" ─────────────────
 * Die Routen lesen den eigenen Stimm-Zustand nach dem Schreiben ohnehin
 * AUTORITATIV neu (`myVote` aus der Datenbank, wegen Doppelklick-Rennen). Wer
 * stattdessen den geklickten Wert einsetzte, müsste die Umschalt-Logik hier ein
 * zweites Mal nachbauen — inklusive der Toggle-Semantik („gleicher Wert = weg").
 * Zwei Zustände sind die kleinere und die ehrlichere Schnittstelle.
 */

/** 1 = auf, -1 = ab, null = keine Stimme. */
export type UpvoteState = 1 | -1 | null

/** Um wie viel ändert sich „Anzahl Aufstimmen" beim Übergang? -1, 0 oder +1. */
export function upvoteDelta(before: UpvoteState, after: UpvoteState): -1 | 0 | 1 {
  const had = before === 1
  const has = after === 1
  if (had === has) return 0
  return has ? 1 : -1
}
