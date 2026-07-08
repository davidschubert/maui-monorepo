import { z } from 'zod'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

export const SORT_MODES = ['top', 'new', 'trending', 'discussed'] as const

export function createCommentSchema(t: TranslateFn = identity) {
  return z.object({
    targetId: z.string().min(1, t('comments.validation.targetRequired')),
    targetType: z.string().min(1, t('comments.validation.targetRequired')),
    content: z
      .string()
      .min(1, t('comments.validation.contentRequired'))
      .max(10_000, t('comments.validation.contentMax')),
    parentId: z.string().min(1).optional(),
    // Seiten-URL für die Reply-Notification. Sicherheits-Guard: nur INTERNE
    // absolute Pfade. Genau EIN führender "/", danach KEIN /, \ oder % — sonst
    // werden "//evil", "/\evil" (Browser normalisiert \→/) und "/%2F%2Fevil"
    // zu protokoll-relativen Off-Site-Links → Open-Redirect. Body verbietet
    // zusätzlich jedes Whitespace und jeden Backslash (auch "/ /evil", "/\t//evil").
    targetUrl: z
      .string()
      .max(2000)
      .refine(v => /^\/(?![/\\%])[^\s\\]*$/.test(v), {
        message: 'targetUrl must be an internal absolute path',
      })
      .optional(),
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
