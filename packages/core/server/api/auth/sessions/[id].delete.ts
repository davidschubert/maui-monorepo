import { createSessionClient, clearSessionCookie } from '../../../lib/appwrite'

/**
 * Eine eigene Session beenden. Ist es die AKTUELLE Session, ist danach auch das
 * Cookie ungültig → Cookie löschen und self melden (Client loggt aus + leitet um).
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const sessionId = getRouterParam(event, 'id')
  if (!sessionId) {
    throw createError({ status: 400, statusText: 'Missing session id' })
  }

  const { account } = createSessionClient(event)

  let self = false
  try {
    const current = await account.getSession({ sessionId: 'current' })
    self = current.$id === sessionId
  }
  catch {
    // current nicht ermittelbar — als Fremdsession behandeln
  }

  await account.deleteSession({ sessionId })
  if (self) clearSessionCookie(event)

  return { ok: true, self }
})
