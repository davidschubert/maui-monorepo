import { z } from 'zod'
import type { TranslateFn } from './auth'

const identity: TranslateFn = key => key

export function createProfileSchema(t: TranslateFn = identity) {
  return z.object({
    name: z.string(t('validation.required')).min(2, t('validation.nameMin')),
    bio: z.string().max(500, t('validation.bioMax')).optional(),
    // Wird ins native Appwrite-Phone-Feld geschrieben → strenges E.164
    // (Start mit '+', max. 15 Ziffern, keine Leerzeichen). Leer = Feld löschen.
    phone: z.string()
      .optional()
      .refine(value => !value || /^\+[1-9]\d{1,14}$/.test(value), t('validation.phoneFormat')),
    // Akzeptiert sowohl externe URLs als auch die relative Storage-URL
    // (/api/storage/<bucket>/<id>) — daher kein z.url(), nur Längenlimit.
    avatarUrl: z.string().max(2048, t('validation.urlInvalid')).optional(),
  })
}

export const profileSchema = createProfileSchema()

export type ProfileInput = z.infer<typeof profileSchema>
