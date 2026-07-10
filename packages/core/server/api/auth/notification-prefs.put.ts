import { z } from 'zod'
import { createSessionClient } from '../../lib/appwrite'

const prefsSchema = z.object({
  emailNotifications: z.enum(['off', 'instant', 'digest']),
  // Mail-Sprache = UI-Sprache beim Speichern (der Server kennt die Locale
  // eines Users sonst nicht)
  emailLocale: z.enum(['de', 'en']),
})

/**
 * E-Mail-Benachrichtigungs-Präferenz des eingeloggten Users setzen
 * (Settings → Benachrichtigungen). prefs werden gemerged — updatePrefs
 * ERSETZT sonst bio/avatarUrl & Co.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const { emailNotifications, emailLocale } = await readValidatedBody(event, prefsSchema.parse)

  const { account } = createSessionClient(event)
  await account.updatePrefs({
    prefs: {
      ...event.context.user.prefs,
      emailNotifications,
      emailLocale,
    },
  })
  return { ok: true, emailNotifications, emailLocale }
})
