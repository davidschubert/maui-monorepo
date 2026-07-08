import type { Models } from 'node-appwrite'

export const FEEDBACK_TABLE = 'feedback'

export const FEEDBACK_CATEGORIES = ['idea', 'bug', 'other'] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

export type FeedbackStatus = 'open' | 'resolved'

export const MAX_FEEDBACK_MESSAGE = 2000

export interface FeedbackRow extends Models.Row {
  category: FeedbackCategory
  message: string
  /** Pfad, von dem gesendet wurde (Kontext für die Sichtung) */
  page: string
  /** leer = Gast */
  userId: string
  userName: string
  status: FeedbackStatus
}

export interface FeedbackListResponse {
  total: number
  rows: FeedbackRow[]
}
