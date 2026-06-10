import { z } from 'zod'

export type TranslateFn = (key: string) => string

// Ohne t() bleiben die Meldungen i18n-Keys — die UI übersetzt via
// create*Schema(t), Server-Routes validieren mit der Key-Variante.
const identity: TranslateFn = key => key

export function createLoginSchema(t: TranslateFn = identity) {
  return z.object({
    email: z.email(t('validation.emailInvalid')),
    password: z.string().min(8, t('validation.passwordMin')),
  })
}

export function createRegisterSchema(t: TranslateFn = identity) {
  return createLoginSchema(t).extend({
    name: z.string().min(2, t('validation.nameMin')),
  })
}

export const loginSchema = createLoginSchema()
export const registerSchema = createRegisterSchema()

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
