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

  // Andere aktive Sessions invalidieren (z.B. ein vermutet kompromittiertes
  // Gerät) — die eigene Session bleibt erhalten. Best effort: ein Fehler hier
  // darf die bereits erfolgte Passwortänderung nicht zurückrollen.
  try {
    const { sessions } = await account.listSessions()
    await Promise.all(
      sessions
        .filter(session => !session.current)
        .map(session => account.deleteSession({ sessionId: session.$id }).catch(() => {})),
    )
  }
  catch {
    // Session-Liste nicht abrufbar — Passwort ist dennoch geändert
  }

  return { ok: true }
})
