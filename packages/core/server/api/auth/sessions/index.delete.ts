import { createSessionClient, clearSessionCookie } from '../../../lib/appwrite'

/** Alle eigenen Sessions beenden — meldet immer self (auch die aktuelle ist weg). */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const { account } = createSessionClient(event)
  await account.deleteSessions()
  clearSessionCookie(event)

  return { ok: true, self: true }
})
