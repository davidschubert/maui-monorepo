import type { Comment } from './types/comment'

/**
 * Controversial-Score (Spec-Formel): viel Aktivität bei ausgeglichenem Score.
 * Hohe Gesamt-Votes / |Score| → kontrovers; einseitige Threads ranken niedrig.
 * Reine Funktion → unit-testbar, genutzt von der Server-Sortierung.
 */
export function controversy(comment: Pick<Comment, 'upvotes' | 'downvotes' | 'score'>): number {
  return (comment.upvotes + comment.downvotes) / Math.max(Math.abs(comment.score), 1)
}
