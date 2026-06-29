import type { VoteValue } from './types/comment'

/** Toggle-Semantik: derselbe Vote nochmal → entfernt (null), sonst der neue Wert. */
export function nextVoteValue(prev: VoteValue | null, clicked: VoteValue): VoteValue | null {
  return prev === clicked ? null : clicked
}

/**
 * Neue Zähler nach einem Vote-Wechsel (prev → next) — rein, ohne Seiteneffekt.
 * Basis des optimistischen Updates UND nachvollziehbar gegen den Server-Stand.
 */
export function applyVoteDelta(
  counts: { upvotes: number, downvotes: number },
  prev: VoteValue | null,
  next: VoteValue | null,
): { upvotes: number, downvotes: number, score: number } {
  let upvotes = counts.upvotes
  let downvotes = counts.downvotes
  if (prev === 1) upvotes -= 1
  if (prev === -1) downvotes -= 1
  if (next === 1) upvotes += 1
  if (next === -1) downvotes += 1
  return { upvotes, downvotes, score: upvotes - downvotes }
}
