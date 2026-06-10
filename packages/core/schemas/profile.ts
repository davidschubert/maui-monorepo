import { z } from 'zod'
import type { TranslateFn } from './auth'

const identity: TranslateFn = key => key

export function createProfileSchema(t: TranslateFn = identity) {
  return z.object({
    name: z.string().min(2, t('validation.nameMin')),
    bio: z.string().max(500, t('validation.bioMax')).optional(),
    avatarUrl: z.union([z.url(t('validation.urlInvalid')), z.literal('')]).optional(),
  })
}

export const profileSchema = createProfileSchema()

export type ProfileInput = z.infer<typeof profileSchema>
