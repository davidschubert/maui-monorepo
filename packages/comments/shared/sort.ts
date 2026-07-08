import type { Comment } from './types/comment'

/**
 * Trending-Score (HN-Gravity-Muster): Upvote-Score mit Zeit-Zerfall —
 * frische Threads mit Zuspruch ranken oben, alte sacken ab, egal wie gut
 * sie mal waren. `+1` im Zähler lässt brandneue 0-Score-Threads über
 * alten 0-Score-Threads landen (Frische zählt). `now` wird injiziert
 * (pure Funktion, unit-testbar — shared-Code ruft nie selbst Date.now()).
 */
export function hotness(comment: Pick<Comment, 'score' | '$createdAt'>, nowMs: number): number {
  const ageHours = Math.max(0, (nowMs - Date.parse(comment.$createdAt)) / 3600_000)
  return (comment.score + 1) / (ageHours + 2) ** 1.5
}
