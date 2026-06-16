import { createSessionClient } from '../../lib/appwrite'
import { passwordChangeServerSchema } from '../../../schemas/auth'

/**
 * Passwort ändern (eingeloggter User) — läuft als der User selbst (SessionClient).
 * Appwrite prüft das aktuelle Passwort (oldPassword); wir leaken keine Details.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { currentPassword, password } = await readValidatedBody(event, passwordChangeServerSchema.parse)
  const { account } = createSessionClient(event)

  try {
    await account.updatePassword({ password, oldPassword: currentPassword })
  }
  catch {
    throw createError({ status: 400, statusText: 'Password update failed' })
  }

  return { ok: true }
})
