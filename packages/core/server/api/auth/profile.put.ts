import { createSessionClient } from '../../lib/appwrite'
import { profileSchema } from '../../../schemas/profile'

/**
 * Profil-Update via Account prefs (keine profiles Table — Konzept A1).
 * Läuft als der User selbst (SessionClient), nicht über den AdminClient.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { name, bio, phone, avatarUrl } = await readValidatedBody(event, profileSchema.parse)
  const { account } = createSessionClient(event)

  if (name !== event.context.user.name) {
    await account.updateName({ name })
  }

  // phone in prefs (nicht account.updatePhone — das verlangt Passwort + SMS-Verifikation,
  // unpassend für unsere passwortlosen OTP-User). Foto-URL ebenfalls in prefs.
  await account.updatePrefs({
    prefs: {
      ...event.context.user.prefs,
      bio: bio ?? '',
      phone: phone ?? '',
      avatarUrl: avatarUrl ?? '',
    },
  })

  return { ok: true }
})
