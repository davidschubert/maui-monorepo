import { AppwriteException } from 'node-appwrite'
import { createSessionClient, createAdminClient } from '../../lib/appwrite'
import { profileSchema } from '../../../schemas/profile'

// avatarFileId (URL→fileId) kommt aus server/utils/avatarFile.ts (Auto-Import)
// — geteilt mit der GDPR-Löschung.

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
      // Keine rohe AppwriteException an den Client leaken
      throw createError({ status: 400, statusText: 'Could not update phone number' })
    }
  }

  const nextAvatarUrl = avatarUrl ?? ''
  await account.updatePrefs({
    prefs: {
      ...event.context.user.prefs,
      bio: bio ?? '',
      avatarUrl: nextAvatarUrl,
    },
  })

  // Vorheriges Avatar-File aufräumen, sobald die URL wechselt (kein Storage-Müll).
  // Best-effort: läuft als der User (eigene update/delete-Rechte), Fehler ignorieren.
  const bucketId = useRuntimeConfig(event).public.appwriteAvatarsBucket
  const previousId = avatarFileId(event.context.user.prefs?.avatarUrl, bucketId)
  if (previousId && previousId !== avatarFileId(nextAvatarUrl, bucketId)) {
    const { storage } = createSessionClient(event)
    try {
      await storage.deleteFile({ bucketId, fileId: previousId })
    }
    catch {
      // Datei evtl. schon weg / fremd — egal
    }
  }

  return { ok: true }
})
