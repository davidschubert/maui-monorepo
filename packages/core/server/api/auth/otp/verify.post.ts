import { createAdminClient, setSessionCookie } from '../../../lib/appwrite'
import { otpVerifySchema } from '../../../../schemas/auth'

/** Code prüfen → Session erzeugen → Cookie setzen (wie OAuth-Callback). */
export default defineEventHandler(async (event) => {
  const { userId, code } = await readValidatedBody(event, otpVerifySchema.parse)

  const { account } = createAdminClient(event)

  try {
    const session = await account.createSession({ userId, secret: code })
    setSessionCookie(event, session.secret, session.expire)
    return { ok: true }
  }
  catch {
    // Falscher/abgelaufener Code — generisch, KEIN Cookie
    throw createError({ status: 401, statusText: 'Invalid or expired code' })
  }
})
