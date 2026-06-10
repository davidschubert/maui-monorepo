import { z } from 'zod'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

export const SORT_MODES = ['top', 'new', 'controversial'] as const

export function createCommentSchema(t: TranslateFn = identity) {
  return z.object({
    targetId: z.string().min(1, t('comments.validation.targetRequired')),
    targetType: z.string().min(1, t('comments.validation.targetRequired')),
    content: z
      .string()
      .min(1, t('comments.validation.contentRequired'))
      .max(10_000, t('comments.validation.contentMax')),
    parentId: z.string().min(1).optional(),
  })
}

export function createCommentUpdateSchema(t: TranslateFn = identity) {
  return z.object({
    content: z
      .string()
      .min(1, t('comments.validation.contentRequired'))
      .max(10_000, t('comments.validation.contentMax')),
  })
}

export const commentSchema = createCommentSchema()
export const commentUpdateSchema = createCommentUpdateSchema()
export type CommentInput = z.infer<typeof commentSchema>

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
})
export type VoteInput = z.infer<typeof voteSchema>
