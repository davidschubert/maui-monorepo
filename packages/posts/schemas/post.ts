import { z } from 'zod'
import { MAX_POLL_OPTION_LENGTH, MAX_POLL_OPTIONS, MAX_POST_BODY, MAX_POST_TITLE } from '../shared/types/post'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/** Geplante Posts: Termin in der Zukunft, max. 90 Tage voraus (Fat-Finger-Schutz) */
function scheduledAtSchema(t: TranslateFn) {
  return z.iso.datetime({ offset: true })
    .refine(v => Date.parse(v) > Date.now(), t('posts.validation.scheduleFuture'))
    .refine(v => Date.parse(v) < Date.now() + 90 * 24 * 3600_000, t('posts.validation.scheduleTooFar'))
    .optional()
}

const base = (t: TranslateFn) => ({
  title: z.string().trim().max(MAX_POST_TITLE, t('posts.validation.titleMax')).optional(),
  body: z.string().trim()
    .min(1, t('posts.validation.bodyRequired'))
    .max(MAX_POST_BODY, t('posts.validation.bodyMax')),
  scheduledAt: scheduledAtSchema(t),
})

export function createPostSchema(t: TranslateFn = identity) {
  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('post'), ...base(t) }),
    z.object({ type: z.literal('question'), ...base(t) }),
    z.object({
      type: z.literal('poll'),
      ...base(t),
      pollOptions: z.array(z.string().trim().min(1).max(MAX_POLL_OPTION_LENGTH, t('posts.validation.optionMax')))
        .min(2, t('posts.validation.optionsMin'))
        .max(MAX_POLL_OPTIONS, t('posts.validation.optionsMax')),
      pollEndsAt: z.iso.datetime({ offset: true })
        .refine(v => Date.parse(v) > Date.now(), t('posts.validation.pollEndFuture'))
        .optional(),
    }),
  ])
}

export function createPostEditSchema(t: TranslateFn = identity) {
  return z.object({
    title: z.string().trim().max(MAX_POST_TITLE, t('posts.validation.titleMax')).optional(),
    body: z.string().trim()
      .min(1, t('posts.validation.bodyRequired'))
      .max(MAX_POST_BODY, t('posts.validation.bodyMax')),
  })
}

export function createVoteSchema(t: TranslateFn = identity) {
  return z.object({
    // -1 wäre Toggle-Sonderfall — bewusst nur 0..5, Toggle = gleiche Option erneut
    optionIndex: z.number(t('posts.validation.optionRequired')).int().min(0).max(MAX_POLL_OPTIONS - 1),
  })
}
