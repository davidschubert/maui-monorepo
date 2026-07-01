/**
 * Kurzlebiger JWT für authentifiziertes Realtime. In der SSR-Cookie-Architektur
 * kennt der Web-SDK-Client keine Session → der Realtime-WS verbindet sonst als
 * Gast und empfängt keine `read("users")`-Presence-Events. Der Client setzt
 * diesen JWT (`client.setJWT`) vor dem Subscribe; die WS-URL trägt ihn dann.
 *
 * Härtung (bewusstes Restrisiko, dokumentiert): Appwrite-JWTs sind nicht auf
 * Realtime scopebar — der Token ist ein vollwertiger Session-JWT im JS-Speicher.
 * Relevant nur bei bestehendem XSS; Gegenmaßnahmen: kurze Dauer (15 min statt
 * max. 1h, Client erneuert rechtzeitig) + Rate-Limit auf dem Mint (Middleware).
 */
const JWT_DURATION_S = 900

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const { account } = createSessionClient(event)
  // Session kann zwischen Middleware und Route abgelaufen sein → 401, nicht 500.
  const { jwt } = await account.createJWT({ duration: JWT_DURATION_S })
    .catch(() => { throw createError({ status: 401, statusText: 'Unauthorized' }) })
  return { jwt }
})
