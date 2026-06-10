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

  const { name, bio, avatarUrl } = await readValidatedBody(event, profileSchema.parse)
  const { account } = createSessionClient(event)

  if (name !== event.context.user.name) {
    await account.updateName({ name })
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
