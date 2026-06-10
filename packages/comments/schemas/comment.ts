import { z } from 'zod'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

export function createCommentSchema(t: TranslateFn = identity) {
  return z.object({
    postId: z.string().min(1, t('comments.validation.postIdRequired')),
    text: z
      .string()
      .min(1, t('comments.validation.textRequired'))
      .max(2000, t('comments.validation.textMax')),
    parentId: z.string().min(1).optional(),
  })
}

export const commentSchema = createCommentSchema()
export type CommentInput = z.infer<typeof commentSchema>

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
})
export type VoteInput = z.infer<typeof voteSchema>
