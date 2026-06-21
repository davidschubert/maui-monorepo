import { createAdminClient, setSessionCookie } from '../../lib/appwrite'
import { loginSchema } from '../../../schemas/auth'

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, loginSchema.parse)
  const { account } = createAdminClient(event)

  try {
    const session = await account.createEmailPasswordSession({ email, password })
    setSessionCookie(event, session.secret, session.expire)
    await logAuthEvent(event, 'user.login', { userId: session.userId, method: 'password' })
    return { ok: true }
  }
  catch {
    // Keine Appwrite-Details leaken — generische 401
    throw createError({ status: 401, statusText: 'Invalid credentials' })
  }
})
