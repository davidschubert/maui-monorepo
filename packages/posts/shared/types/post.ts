import type { Models } from 'node-appwrite'

export const POSTS_TABLE = 'community_posts'
export const POLL_VOTES_TABLE = 'poll_votes'
export const POST_VOTES_TABLE = 'post_votes'

export const POST_TYPES = ['post', 'poll', 'question'] as const
export type PostType = (typeof POST_TYPES)[number]

/** scheduled = geplant (nur Autor sichtbar) · hidden = Moderation · deleted = Autor-Soft-Delete */
export type PostStatus = 'scheduled' | 'published' | 'hidden' | 'deleted'

export const MAX_POLL_OPTIONS = 6
export const MAX_POLL_OPTION_LENGTH = 100
export const MAX_POST_BODY = 10_000
export const MAX_POST_TITLE = 200

export interface CommunityPost extends Models.Row {
  type: PostType
  /** optional — Fragen/Polls tragen die Frage oft nur im body */
  title: string | null
  /** Markdown-Subset (core shared/markdown.ts), niemals Raw-HTML */
  body: string
  authorId: string
  authorName: string
  status: PostStatus
  scheduledAt: string | null
  publishedAt: string | null
  /** JSON-Array der Optionstexte (max 6) — nur bei type 'poll' */
  pollOptions: string | null
  pollEndsAt: string | null
  /** denormalisiert, schreibt NUR der Server (Recount, Migration 003) */
  upvotes: number
  downvotes: number
  score: number
}

export type PostVoteValue = 1 | -1

export interface PostVote extends Models.Row {
  postId: string
  userId: string
  value: PostVoteValue
}

export interface PostVoteResponse {
  post: CommunityPost
  myVote: PostVoteValue | null
}

export interface PollVote extends Models.Row {
  postId: string
  userId: string
  optionIndex: number
}

/** Poll-Zustand, wie ihn der GET je Post anreichert */
export interface PollState {
  options: string[]
  /** Stimmen je Option — nur gefüllt, wenn results true */
  counts: number[]
  totalVotes: number
  /** eigene Stimme (Options-Index) oder null */
  myVote: number | null
  /** Ergebnisse sichtbar? (eigene Stimme abgegeben ODER Poll beendet) */
  results: boolean
  /** Poll beendet (pollEndsAt erreicht)? */
  ended: boolean
}

export interface FeedPost extends CommunityPost {
  authorAvatarUrl?: string
  poll?: PollState
  /** eigener Up-/Downvote auf den Post (nicht die Poll-Stimme) */
  myPostVote?: PostVoteValue | null
}

export interface PostListResponse {
  rows: FeedPost[]
  nextCursor: string | null
}
