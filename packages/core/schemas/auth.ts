import { z } from 'zod'

// Deutsche Fehlermeldungen inline — Umstellung auf i18n keys folgt in Phase 7

export const loginSchema = z.object({
  email: z.email('Bitte eine gültige E-Mail-Adresse eingeben'),
  password: z.string().min(8, 'Das Passwort muss mindestens 8 Zeichen lang sein'),
})

export const registerSchema = loginSchema.extend({
  name: z.string().min(2, 'Der Name muss mindestens 2 Zeichen lang sein'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
