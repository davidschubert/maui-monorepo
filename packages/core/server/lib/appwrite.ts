import { Client, Account, TablesDB, Health } from 'node-appwrite'
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

  // Lazy get-Accessors: nur genutzte Services werden instanziiert
  return {
    get account() { return new Account(client) },
    get tablesDB() { return new TablesDB(client) },
    get health() { return new Health(client) },
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

  return {
    get account() { return new Account(client) },
    get tablesDB() { return new TablesDB(client) },
  }
}
