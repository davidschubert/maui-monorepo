import { createSessionClient, clearSessionCookie } from '../../lib/appwrite'

export default defineEventHandler(async (event) => {
  try {
    const { account } = createSessionClient(event)
    await account.deleteSession({ sessionId: 'current' })
  }
  catch {
    // Session bereits ungültig — Cookie trotzdem löschen
  }

  clearSessionCookie(event)
  return { ok: true }
})
