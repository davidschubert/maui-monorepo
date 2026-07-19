import { createSessionClient } from '../../lib/appwrite'
import { verificationConfirmSchema } from '../../../schemas/auth'

/**
 * Verifizierung bestätigen (/verify-Seite mit userId+secret aus dem
 * Mail-Link). Läuft über die Session des eingeloggten Users — der Link
 * öffnet die eigene Site, das Cookie ist da. Ohne Session 401 (die Seite
 * bittet dann um Login und der User öffnet den Link erneut).
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { userId, secret } = await readValidatedBody(event, verificationConfirmSchema.parse)

  try {
    const { account } = createSessionClient(event)
    await account.updateVerification({ userId, secret })
  }
  catch {
    // Abgelaufener/falscher Link — generisch, keine Appwrite-Details
    throw createError({ status: 400, statusText: 'Invalid or expired verification link' })
  }

  await logAuthEvent(event, 'user.email_verified', { userId })
  return { ok: true }
})
