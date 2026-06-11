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

export interface RegisterFormOptions {
  /** true = AGB-Checkbox ist Pflicht (maui.auth.termsUrl gesetzt) */
  requireTerms?: boolean
}

/**
 * Formular-Variante des Register-Schemas: Confirm-Password (+ optional AGB).
 * Der Server validiert weiterhin nur name/email/password (registerSchema) —
 * passwordConfirm/terms sind reine UI-Belange.
 */
export function createRegisterFormSchema(t: TranslateFn = identity, options: RegisterFormOptions = {}) {
  return createRegisterSchema(t)
    .extend({
      passwordConfirm: z.string().min(1, t('validation.passwordConfirmRequired')),
      terms: options.requireTerms
        ? z.literal(true, t('validation.termsRequired'))
        : z.boolean().optional(),
    })
    .refine(data => data.password === data.passwordConfirm, {
      message: t('validation.passwordMismatch'),
      path: ['passwordConfirm'],
    })
}

export function createRecoverySchema(t: TranslateFn = identity) {
  return z.object({
    email: z.email(t('validation.emailInvalid')),
  })
}

/** Formular der Reset-Page (userId/secret kommen aus der Mail-URL, nicht aus dem Formular) */
export function createResetSchema(t: TranslateFn = identity) {
  return z.object({
    password: z.string().min(8, t('validation.passwordMin')),
    passwordConfirm: z.string().min(1, t('validation.passwordConfirmRequired')),
  }).refine(data => data.password === data.passwordConfirm, {
    message: t('validation.passwordMismatch'),
    path: ['passwordConfirm'],
  })
}

export const loginSchema = createLoginSchema()
export const registerSchema = createRegisterSchema()
export const recoverySchema = createRecoverySchema()
/** OTP-Verify: 6-stelliger Code aus der Mail (server-only, keine i18n nötig) */
export const otpVerifySchema = z.object({
  userId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
})
export const resetServerSchema = z.object({
  userId: z.string().min(1),
  secret: z.string().min(1),
  password: z.string().min(8),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterFormInput = z.infer<ReturnType<typeof createRegisterFormSchema>>
export type RecoveryInput = z.infer<typeof recoverySchema>
export type ResetFormInput = z.infer<ReturnType<typeof createResetSchema>>
