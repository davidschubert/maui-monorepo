import { createAdminClient, setSessionCookie } from '../../../lib/appwrite'

export default defineEventHandler(async (event) => {
  const { userId, secret } = getQuery(event)

  if (!userId || !secret) {
    return sendRedirect(event, '/login?error=oauth')
  }

  try {
    const { account } = createAdminClient(event)
    const session = await account.createSession({
      userId: String(userId),
      secret: String(secret),
    })

    setSessionCookie(event, session.secret, session.expire)
    return sendRedirect(event, '/')
  }
  catch {
    return sendRedirect(event, '/login?error=oauth')
  }
})
