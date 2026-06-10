import { createSessionClient, sessionCookieName } from '../lib/appwrite'

/**
 * Setzt event.context.user pro Request. Wirft nie — ohne (gültige)
 * Session bleibt user einfach undefined, Routen entscheiden selbst.
 */
export default defineEventHandler(async (event) => {
  // Ohne Cookie kein Appwrite-Roundtrip (läuft für jeden Request)
  if (!getCookie(event, sessionCookieName(event))) return

  try {
    const { account } = createSessionClient(event)
    event.context.user = await account.get()
  }
  catch {
    // Session ungültig/abgelaufen — user bleibt undefined
  }
})
