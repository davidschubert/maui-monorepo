import { Client, Realtime } from 'appwrite'

/**
 * EINE geteilte, JWT-authentifizierte Realtime-Verbindung für die ganze App.
 *
 * Presence (usePresence), Row-Streams (useRealtimeRows), Account-/Notification-
 * Streams multiplexen alle über DIESELBE WebSocket (die SDK-Realtime bündelt
 * beliebig viele Channels auf einem Socket). Früher öffnete jeder useRealtimeRows-
 * Aufruf eine eigene native WS — auf einer Seite mit Kommentaren + Glocke +
 * Account schnell 3+ Sockets. Jetzt: ein Socket, SDK-Reconnect, SDK-Protokoll.
 *
 * ZWEI Clients pro Tab (bewusst getrennt):
 * - cookieClient: OHNE JWT → HTTP-SDK-Aufrufe (z. B. presences.list()) sind per
 *   Session-Cookie authentifiziert (gleiche Domain). Ein JWT hier löste 403 aus:
 *   Appwrite verbietet „JWT und Cookie in derselben Anfrage".
 * - rtClient: MIT JWT → nur für die Realtime-WS. Ohne JWT verbindet sie sich als
 *   Gast und empfängt keine read("users")-Events; der WS-Presence-Upsert schlägt fehl.
 *
 * SSR-Hinweis: erst bei erstem Zugriff (Client, in setup/onMounted) instanziiert.
 */
let cookieClient: Client | null = null
let rtClient: Client | null = null
let realtime: Realtime | null = null

function ensureClients() {
  const config = useRuntimeConfig()
  if (!cookieClient) cookieClient = new Client().setEndpoint(config.public.appwriteEndpoint).setProject(config.public.appwriteProjectId)
  if (!rtClient) rtClient = new Client().setEndpoint(config.public.appwriteEndpoint).setProject(config.public.appwriteProjectId)
  if (!realtime) realtime = new Realtime(rtClient)
  return { cookieClient, rtClient, realtime }
}

/** Cookie-authentifizierter Client für HTTP-SDK-Services (Presences, …). */
export function realtimeCookieClient(): Client {
  return ensureClients().cookieClient
}

/** Die eine geteilte SDK-Realtime-Instanz (JWT-Client, multiplext alle Channels). */
export function sharedRealtime(): Realtime {
  return ensureClients().realtime
}

// ── Realtime-Auth via JWT ──────────────────────────────────────────────────
// Appwrite-korrekter Weg, den Realtime-WS bei httpOnly-Sessions zu authentifizieren:
// ein kurzlebiger JWT (setJWT) auf dem Realtime-Client. Nötig für den Empfang von
// read("users")-Events UND den WS-Presence-Upsert. JWTs laufen nach ≤1h ab → vor
// Ablauf erneuern. Fehlschlag → Gast-WS + Poll-/Refetch-Fallback der Konsumenten.
const JWT_REFRESH_MS = 50 * 60_000
let jwtPromise: Promise<void> | null = null
let jwtReady = false

async function fetchJwt() {
  try {
    const { jwt } = await $fetch<{ jwt: string }>('/api/auth/realtime-token')
    ensureClients().rtClient.setJWT(jwt) // NUR der Realtime-Client — nie der Cookie-Client
    jwtReady = true
  }
  catch {
    // Kein gültiger JWT (ausgeloggt / Session abgelaufen) → Gast-WS + Poll-/
    // Refetch-Fallback. Presence-UPSERT dann überspringen (siehe hasRealtimeJwt),
    // sonst quittiert Appwrite jeden Upsert mit „User must be authorized".
    jwtReady = false
  }
}

/**
 * Trägt der Realtime-Client aktuell einen (erfolgreich geholten) JWT? Gate für
 * Aktionen, die zwingend Auth brauchen (Presence-Upsert). Reine read("any")-
 * Row-Subscriptions funktionieren auch als Gast und brauchen dieses Gate nicht.
 */
export function hasRealtimeJwt(): boolean {
  return jwtReady
}

/**
 * Stellt sicher, dass der Realtime-Client einen (aktuellen) JWT trägt, BEVOR sich
 * die WS verbindet. Idempotenter Start + periodischer Refresh (< 1h). Vor jedem
 * realtime.subscribe()/upsertPresence() awaiten.
 */
export function ensureRealtimeJwt(): Promise<void> {
  ensureClients()
  if (!jwtPromise) {
    jwtPromise = fetchJwt()
    setInterval(fetchJwt, JWT_REFRESH_MS)
  }
  return jwtPromise
}
