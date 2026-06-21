import { createSessionClient, clearSessionCookie } from '../../lib/appwrite'

export default defineEventHandler(async (event) => {
  // Vor dem Invalidieren protokollieren, solange der User noch bekannt ist
  const user = event.context.user
  if (user) await logAuthEvent(event, 'user.logout', { userId: user.$id, name: user.name })

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
