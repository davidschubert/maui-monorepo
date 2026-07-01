import { Client, Account, TablesDB, Health, Storage, Users, Presences } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Cookie-Name nach Konzept A3: a_session_<PROJECT_ID>.
 * Das Web SDK erkennt dieses Cookie automatisch — Browser-Realtime
 * läuft damit authentifiziert statt anonym.
 */
export function sessionCookieName(event: H3Event): string {
  const config = useRuntimeConfig(event)
  return `a_session_${config.public.appwriteProjectId}`
}

/**
 * Session-Cookie setzen/löschen — httpOnly + sameSite immer, secure in
 * Produktion (localhost hat kein HTTPS, daher konditional via import.meta.dev).
 */
export function setSessionCookie(event: H3Event, secret: string, expire: string) {
  setCookie(event, sessionCookieName(event), secret, {
    expires: new Date(expire),
    path: '/',
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'strict',
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, sessionCookieName(event), { path: '/' })
}

/**
 * Reicht den Browser-User-Agent an Appwrite weiter, damit serverseitig erzeugte
 * Sessions das echte Gerät (Browser + Version + OS) statt des Node-SDK aufzeichnen.
 */
function forwardClientContext(client: Client, event?: H3Event) {
  if (!event) return
  const userAgent = getHeader(event, 'user-agent')
  if (userAgent) client.setForwardedUserAgent(userAgent)
}

/**
 * AdminClient — authentifiziert per API Key (server-only, Resource-based
 * mit minimalen Scopes). Nur für privilegierte Operationen: Signup,
 * Admin-Aktionen, Rate-Limit-Bypass.
 */
export function createAdminClient(event?: H3Event) {
  const config = useRuntimeConfig(event)
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    .setProject(config.public.appwriteProjectId)
    .setKey(config.appwriteKey)

  forwardClientContext(client, event)

  // Lazy get-Accessors: nur genutzte Services werden instanziiert
  return {
    get account() { return new Account(client) },
    get tablesDB() { return new TablesDB(client) },
    get health() { return new Health(client) },
    get storage() { return new Storage(client) },
    get users() { return new Users(client) },
    get presences() { return new Presences(client) },
  }
}

/**
 * SessionClient — agiert als der eingeloggte User (Session-Cookie).
 * Pro Request NEU erstellen, NIE über Requests teilen — sonst leakt
 * eine User-Session in fremde Responses.
 */
export function createSessionClient(event: H3Event) {
  const config = useRuntimeConfig(event)
  const client = new Client()
    .setEndpoint(config.public.appwriteEndpoint)
    .setProject(config.public.appwriteProjectId)

  const session = getCookie(event, sessionCookieName(event))
  if (session) client.setSession(session)

  forwardClientContext(client, event)

  return {
    get account() { return new Account(client) },
    get tablesDB() { return new TablesDB(client) },
    get storage() { return new Storage(client) },
  }
}
