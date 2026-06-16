import { createAdminClient, clearSessionCookie } from '../../lib/appwrite'

/**
 * Eigenen Account löschen. Appwrites account-API kennt kein Self-Delete —
 * daher über den AdminClient (users.delete) für die eigene User-ID, danach
 * Session-Cookie entfernen. Unumkehrbar.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { users } = createAdminClient(event)
  await users.delete({ userId: event.context.user.$id })
  clearSessionCookie(event)

  return { ok: true }
})
