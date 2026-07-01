/**
 * Kurzlebiger JWT für authentifiziertes Realtime. In der SSR-Cookie-Architektur
 * kennt der Web-SDK-Client keine Session → der Realtime-WS verbindet sonst als
 * Gast und empfängt keine `read("users")`-Presence-Events. Der Client setzt
 * diesen JWT (`client.setJWT`) vor dem Subscribe; die WS-URL trägt ihn dann.
 * Gültigkeit max. 1h — der Client erneuert ihn rechtzeitig.
 */
export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const { account } = createSessionClient(event)
  const { jwt } = await account.createJWT({ duration: 3600 })
  return { jwt }
})
