import { AppwriteException } from 'node-appwrite'
import { createSessionClient, createAdminClient } from '../../lib/appwrite'
import { profileSchema } from '../../../schemas/profile'

/**
 * Profil-Update: Name + prefs (bio/avatarUrl) als der User selbst (SessionClient).
 * Die Telefonnummer landet im NATIVEN Appwrite-Phone-Feld via Admin-API
 * (account.updatePhone würde Passwort + SMS-Verifikation verlangen — unpassend
 * für unsere passwortlosen OTP-User; der AdminClient setzt es ohne beides).
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

  // Natives Phone-Feld nur bei Änderung anfassen. Leerstring löscht es (von Appwrite
  // 1.9.0 verifiziert). Eindeutigkeit ist erzwungen → 409 sauber als Konflikt melden.
  const nextPhone = phone ?? ''
  if (nextPhone !== (event.context.user.phone ?? '')) {
    const { users } = createAdminClient(event)
    try {
      await users.updatePhone({ userId: event.context.user.$id, number: nextPhone })
    }
    catch (error) {
      if (error instanceof AppwriteException && error.code === 409) {
        throw createError({ status: 409, statusText: 'Phone already in use', data: { code: 'phone_taken' } })
      }
      throw error
    }
  }

  await account.updatePrefs({
    prefs: {
      ...event.context.user.prefs,
      bio: bio ?? '',
      avatarUrl: avatarUrl ?? '',
    },
  })

  return { ok: true }
})
