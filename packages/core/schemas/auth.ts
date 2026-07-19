import { z } from 'zod'

export type TranslateFn = (key: string) => string

// Ohne t() bleiben die Meldungen i18n-Keys — die UI übersetzt via
// create*Schema(t), Server-Routes validieren mit der Key-Variante.
const identity: TranslateFn = key => key

/**
 * E-Mails IMMER normalisieren: Appwrites createEmailToken matcht
 * case-SENSITIV und legt sonst Duplikat-Accounts an (signup lowercased,
 * OTP nicht — empirisch in Phase 20 gefunden).
 */
function normalizedEmail(t: TranslateFn) {
  return z.email(t('validation.emailInvalid')).transform(value => value.trim().toLowerCase())
}

export function createLoginSchema(t: TranslateFn = identity) {
  return z.object({
    email: normalizedEmail(t),
    password: z.string(t('validation.required')).min(8, t('validation.passwordMin')),
  })
}

/**
 * Starkes Passwort (nur Registrierung): min. 8 Zeichen + je 1 Groß-/Kleinbuchstabe,
 * Zahl und Sonderzeichen. Der Login bleibt bewusst bei min. 8 (Bestandskonten).
 */
function strongPassword(t: TranslateFn = identity) {
  return z.string(t('validation.required'))
    .min(8, t('validation.passwordMin'))
    .refine(
      value => /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value),
      t('validation.passwordComplexity'),
    )
}

export function createRegisterSchema(t: TranslateFn = identity) {
  return createLoginSchema(t).extend({
    name: z.string(t('validation.required')).min(2, t('validation.nameMin')),
    password: strongPassword(t),
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
      passwordConfirm: z.string(t('validation.required')).min(1, t('validation.passwordConfirmRequired')),
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
    email: normalizedEmail(t),
  })
}

/**
 * Formular der Reset-Page (userId/secret kommen aus der Mail-URL, nicht aus dem
 * Formular). Neues Passwort MUSS die Komplexitäts-Policy erfüllen — sonst
 * unterläuft der „Passwort vergessen"-Flow die Registrierungs-Anforderungen.
 */
export function createResetSchema(t: TranslateFn = identity) {
  return z.object({
    password: strongPassword(t),
    passwordConfirm: z.string(t('validation.required')).min(1, t('validation.passwordConfirmRequired')),
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

export interface OtpRequestOptions {
  /** true = AGB-Checkbox ist Pflicht (register-Modus + maui.auth.termsUrl) */
  requireTerms?: boolean
  /** true = Name ist Pflicht (register-Modus, analog zur Passwort-Registrierung) */
  requireName?: boolean
}

/**
 * E-Mail-Schritt des OTP-Formulars: Name (im Register-Modus Pflicht, sonst optional)
 * + optionale AGB-Pflicht. Der Name wird nach dem Verify gesetzt.
 */
export function createOtpRequestSchema(t: TranslateFn = identity, options: OtpRequestOptions = {}) {
  return z.object({
    email: normalizedEmail(t),
    name: options.requireName
      ? z.string(t('validation.required')).min(2, t('validation.nameMin'))
      : z.union([z.string().min(2, t('validation.nameMin')), z.literal('')], t('validation.nameMin')).optional(),
    terms: options.requireTerms
      ? z.literal(true, t('validation.termsRequired'))
      : z.boolean().optional(),
  })
}

export type OtpRequestInput = z.infer<ReturnType<typeof createOtpRequestSchema>>
export const resetServerSchema = z.object({
  userId: z.string().min(1),
  secret: z.string().min(1),
  password: strongPassword(),
})

/** E-Mail-Verifizierung bestätigen (userId+secret aus dem Mail-Link) */
export const verificationConfirmSchema = z.object({
  userId: z.string().min(1),
  secret: z.string().min(1),
})

/** Passwort-Änderung im eingeloggten Zustand: aktuelles + neues (stark) + Bestätigung */
export function createPasswordChangeSchema(t: TranslateFn = identity) {
  return z.object({
    currentPassword: z.string(t('validation.required')).min(1, t('validation.required')),
    password: strongPassword(t),
    passwordConfirm: z.string(t('validation.required')).min(1, t('validation.passwordConfirmRequired')),
  }).refine(data => data.password === data.passwordConfirm, {
    message: t('validation.passwordMismatch'),
    path: ['passwordConfirm'],
  })
}

/** Server-Variante: passwordConfirm ist reine UI-Validierung */
export const passwordChangeServerSchema = z.object({
  currentPassword: z.string().min(1),
  password: strongPassword(),
})

export type PasswordChangeInput = z.infer<ReturnType<typeof createPasswordChangeSchema>>

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterFormInput = z.infer<ReturnType<typeof createRegisterFormSchema>>
export type RecoveryInput = z.infer<typeof recoverySchema>
export type ResetFormInput = z.infer<ReturnType<typeof createResetSchema>>
