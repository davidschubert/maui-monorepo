import { z } from 'zod'
import type { TranslateFn } from './auth'

const identity: TranslateFn = key => key

export function createProfileSchema(t: TranslateFn = identity) {
  return z.object({
    name: z.string(t('validation.required')).min(2, t('validation.nameMin')),
    bio: z.string().max(500, t('validation.bioMax')).optional(),
    phone: z.string().max(30, t('validation.phoneMax')).optional(),
    // Akzeptiert sowohl externe URLs als auch die relative Storage-URL
    // (/api/storage/<bucket>/<id>) — daher kein z.url(), nur Längenlimit.
    avatarUrl: z.string().max(2048, t('validation.urlInvalid')).optional(),
  })
}

export const profileSchema = createProfileSchema()

export type ProfileInput = z.infer<typeof profileSchema>
