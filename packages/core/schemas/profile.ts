import { z } from 'zod'

export const profileSchema = z.object({
  name: z.string().min(2, 'Der Name muss mindestens 2 Zeichen lang sein'),
  bio: z.string().max(500, 'Die Bio darf höchstens 500 Zeichen lang sein').optional(),
  avatarUrl: z.union([z.url('Bitte eine gültige URL eingeben'), z.literal('')]).optional(),
})

export type ProfileInput = z.infer<typeof profileSchema>
