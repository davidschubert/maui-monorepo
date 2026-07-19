import { Account, Client } from 'node-appwrite'
import { verificationConfirmSchema } from '../../../schemas/auth'

/**
 * Verifizierung bestätigen (/verify-Seite mit userId+secret aus dem
 * Mail-Link). BEWUSST ohne Session-Pflicht: der Link wird oft auf einem
 * anderen Gerät geöffnet (Mail am Handy, Registrierung am Desktop) — der
 * Appwrite-Endpoint ist scope 'public', das Token selbst ist der Beweis
 * (wie beim Passwort-Recovery). Rate-limited via rate-limit-Middleware.
 */
export default defineEventHandler(async (event) => {
  const { userId, secret } = await readValidatedBody(event, verificationConfirmSchema.parse)

  const config = useRuntimeConfig(event)

  try {
    const account = new Account(new Client()
      .setEndpoint(config.public.appwriteEndpoint)
      .setProject(config.public.appwriteProjectId))
    await account.updateVerification({ userId, secret })
  }
  catch {
    // Abgelaufener/falscher Link — generisch, keine Appwrite-Details
    throw createError({ status: 400, statusText: 'Invalid or expired verification link' })
  }

  await logAuthEvent(event, 'user.email_verified', { userId })
  return { ok: true }
})
