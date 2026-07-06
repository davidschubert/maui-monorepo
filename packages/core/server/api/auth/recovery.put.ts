import { createSessionClient } from '../../lib/appwrite'
import { resetServerSchema } from '../../../schemas/auth'

/** Passwort mit userId+secret aus der Recovery-Mail setzen (Guest-Endpoint). */
export default defineEventHandler(async (event) => {
  const { userId, secret, password } = await readValidatedBody(event, resetServerSchema.parse)

  const { account } = createSessionClient(event)

  try {
    await account.updateRecovery({ userId, secret, password })
    await logAuthEvent(event, 'user.password_changed', { userId, method: 'recovery' })
    return { ok: true }
  }
  catch {
    // Abgelaufenes/falsches Secret — generisch antworten
    throw createError({ status: 400, statusText: 'Invalid or expired recovery link' })
  }
})
