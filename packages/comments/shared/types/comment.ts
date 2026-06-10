import type { Models } from 'node-appwrite'

export const COMMENTS_TABLE = 'comments'
export const VOTES_TABLE = 'comment_votes'

/** Moderations-Hook für packages/admin (später): nur 'visible' wird gelistet */
export type CommentStatus = 'visible' | 'hidden' | 'flagged'

export interface Comment extends Models.Row {
  postId: string
  text: string
  authorId: string
  authorName: string
  parentId: string | null
  status: CommentStatus
}

export interface CommentVote extends Models.Row {
  commentId: string
  userId: string
  /** 1 = Upvote, -1 = Downvote */
  value: number
}
