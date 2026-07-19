import { createSessionClient } from '../../lib/appwrite'

/**
 * Verifizierungs-Mail erneut anfordern (Banner-Button). Session-Pflicht;
 * mail-versendende Route → ALWAYS_LIMITED im zentralen Rate-Limit.
 * Bereits verifiziert = No-op (kein Fehler, der Banner ist dann eh weg).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  if (user.emailVerification) {
    return { ok: true, alreadyVerified: true }
  }

  const config = useRuntimeConfig(event)
  if (!config.public.appUrl) {
    throw createError({ status: 503, statusText: 'Verification unavailable' })
  }

  try {
    const { account } = createSessionClient(event)
    await account.createVerification({ url: `${config.public.appUrl}/verify` })
  }
  catch {
    // Keine Appwrite-Details leaken (z.B. SMTP-Zustand der Instanz)
    throw createError({ status: 503, statusText: 'Verification unavailable' })
  }

  return { ok: true }
})
