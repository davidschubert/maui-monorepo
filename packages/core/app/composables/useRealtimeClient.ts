import type { Client, Realtime } from 'appwrite'
import { realtimeAllowed } from '../../shared/realtimeGate'

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
 *
 * ── WARUM ALLES ASYNC IST (B4, 2026-08-01) ──────────────────────────────────
 * Das Appwrite-WEB-SDK ist im Projekt ausschließlich für Realtime erlaubt und
 * wog als STATISCHER Import ~76 kB (25,7 kB gzip) im Initial-Bundle JEDER App,
 * die core erweitert — auch auf Seiten, die nie etwas abonnieren. Der Import
 * ist deshalb DYNAMISCH (`import('appwrite')`), und jeder Zugriff auf Client/
 * Realtime läuft über ein Promise. Der Typ-Import oben ist `import type` und
 * wird beim Kompilieren restlos entfernt — er zieht nichts ins Bundle.
 *
 * RACE-FREIHEIT ist hier keine Kür: der Socket ist EINE Instanz über viele
 * Konsumenten. Sie hängt an GENAU EINEM `clientsPromise` — zwei gleichzeitige
 * Erstaufrufe (Config-Plugin + Themes-Plugin + Presence) bekommen dasselbe
 * Promise und damit denselben Socket, nie zwei. Das `import('appwrite')`
 * selbst darf ruhig mehrfach im Code stehen: der Modul-Registry des Browsers
 * lädt die Datei genau einmal.
 *
 * KEIN gemeinsamer `loadAppwriteSdk()`-Helfer (bewusst, gemessen): sobald der
 * SDK-NAMESPACE durch eine Funktion gereicht wird, kann Rollup nicht mehr
 * sehen, welche Exporte benutzt werden — der Chunk wuchs damit von 76 kB auf
 * 148 kB (Storage, Messaging, Functions, Teams, Avatars kamen mit). Jeder
 * Konsument destrukturiert deshalb DIREKT am `import('appwrite')`
 * (`const { Channel } = await import('appwrite')`); nur so bleibt der
 * dynamische Chunk so klein wie der frühere statische Import.
 */
interface RealtimeClients {
  cookieClient: Client
  rtClient: Client
  realtime: Realtime
}

let clientsPromise: Promise<RealtimeClients> | null = null

/**
 * ── DAS CONFIG-GATE (F14, 2026-08-01) ──────────────────────────────────────
 * `pukalani.realtime.enabled` (Core-Default AN, Regel + Begründung in
 * shared/realtimeGate.ts). Gelesen wird es HIER, an der einzigen Tür zum
 * Web-SDK — nicht in den drei Plugins: sonst muss sich jeder künftige
 * Realtime-Konsument daran erinnern, und beim vierten ist es vergessen
 * (dieselbe Überlegung wie beim `!databaseId`-Guard in useRealtimeRows).
 *
 * MEMOISIERT, anders als `hasSession()` unten: die App-Config ist zur Laufzeit
 * konstant, während der Auth-Zustand sich im selben Fenster ändern darf.
 *
 * Der Rückfall ohne Nuxt-Kontext ist der Core-Default (AN) und in der Praxis
 * unerreichbar: JEDER Einstieg (useRealtimeRows, usePresence/-State,
 * useRealtimeAccount, ensureRealtimeJwt) fragt das Gate SYNCHRON im Setup ab,
 * also lange bevor ein Timer oder ein Post-await-Pfad hier ankommen kann. In
 * einer App mit ausgeschaltetem Gate steht der Wert damit schon fest, bevor
 * irgendetwas einen Socket öffnen könnte.
 */
let gateOpen: boolean | undefined

export function realtimeEnabled(): boolean {
  if (gateOpen !== undefined) return gateOpen
  if (!tryUseNuxtApp()) return true
  const pukalani = useAppConfig().pukalani as { realtime?: { enabled?: boolean } } | undefined
  gateOpen = realtimeAllowed(pukalani?.realtime?.enabled)
  return gateOpen
}

/**
 * Die beiden Clients + die geteilte Realtime-Instanz. Die Runtime-Config wird
 * SYNCHRON gelesen (vor dem ersten await), weil `useRuntimeConfig()` einen
 * gültigen Nuxt-Kontext braucht — nach einem await ist der weg. Alle
 * öffentlichen Einstiege unten werden aus Composable-/Plugin-Setup gerufen.
 *
 * `null` heißt „diese App hat keine Realtime" (Config-Gate aus). Der Rückgabetyp
 * ist bewusst nullable und nicht etwa ein throw: so ZWINGT der strict-Modus
 * jeden — auch künftigen — Konsumenten, den Fall zu behandeln. Der Vertrag steht
 * damit im Typ und nicht in einer Konvention, an die man sich erinnern muss.
 */
export function ensureRealtimeClients(): Promise<RealtimeClients | null> {
  if (!realtimeEnabled()) return Promise.resolve(null)
  if (!clientsPromise) {
    const config = useRuntimeConfig()
    const endpoint = config.public.appwriteEndpoint
    const project = config.public.appwriteProjectId
    clientsPromise = import('appwrite').then(({ Client, Realtime }) => {
      const cookieClient = new Client().setEndpoint(endpoint).setProject(project)
      const rtClient = new Client().setEndpoint(endpoint).setProject(project)
      return { cookieClient, rtClient, realtime: new Realtime(rtClient) }
    })
  }
  return clientsPromise
}

/** Cookie-authentifizierter Client für HTTP-SDK-Services (Presences, …). `null` = Gate aus. */
export async function realtimeCookieClient(): Promise<Client | null> {
  return (await ensureRealtimeClients())?.cookieClient ?? null
}

/** Die eine geteilte SDK-Realtime-Instanz (JWT-Client, multiplext alle Channels). `null` = Gate aus. */
export async function sharedRealtime(): Promise<Realtime | null> {
  return (await ensureRealtimeClients())?.realtime ?? null
}

// ── Realtime-Auth via JWT ──────────────────────────────────────────────────
// Appwrite-korrekter Weg, den Realtime-WS bei httpOnly-Sessions zu authentifizieren:
// ein kurzlebiger JWT (setJWT) auf dem Realtime-Client. Nötig für den Empfang von
// read("users")-Events UND den WS-Presence-Upsert. Server mintet 15-min-JWTs
// (Härtung: kleines XSS-Fenster) → Refresh deutlich vor Ablauf. Fehlschlag →
// Gast-WS + Poll-/Refetch-Fallback der Konsumenten.
const JWT_REFRESH_MS = 12 * 60_000
let jwtPromise: Promise<void> | null = null
let jwtReady = false
let jwtTimer: ReturnType<typeof setInterval> | undefined

/**
 * ── GAST-GATE (F11, 2026-08-01) ────────────────────────────────────────────
 * Hat dieser Browser überhaupt eine Session?
 *
 * Die Antwort kostet KEINEN Request: `plugins/auth.server.ts` stellt den
 * Auth-Store beim SSR aus `event.context.user`, und der Pinia-Nuxt-Plugin
 * spielt diesen Zustand im Browser aus dem Payload zurück, BEVOR irgendein
 * App-Plugin läuft. Ein sessionloser Erstbesuch weiß also schon vor dem ersten
 * Klick, dass er keinen Token braucht — sonst hätten wir nur einen 401 gegen
 * einen anderen Request getauscht.
 *
 * Warum nicht das Cookie: `a_session_<PROJECT_ID>` ist httpOnly, der Browser
 * kann es nicht lesen. Warum nicht am Aufrufer: `ensureRealtimeJwt()` ist die
 * EINZIGE Stelle, die `/api/auth/realtime-token` ruft — dieselbe Regel an drei
 * Aufrufern wäre beim vierten vergessen.
 *
 * `tryUseNuxtApp()` statt blindem Store-Zugriff: im Browser bleibt der
 * Nuxt-Kontext nach dem App-Start gesetzt (unctx ohne AsyncLocalStorage), der
 * Aufruf ist also auch aus einem Timer oder nach einem await gültig. Fehlt er
 * trotzdem (SSR, Test-Teardown), gilt „kein Token" — fail-closed ist hier
 * harmlos, weil ein Gast-WS ein vollwertiger Zustand ist.
 *
 * WICHTIG: hier wird NICHT memoisiert. Der Zustand wird bei JEDEM Aufruf frisch
 * gelesen, damit ein Login im selben Fenster sofort durchkommt (der
 * realtime-auth-Plugin ruft dann syncRealtimeAuth → ensureRealtimeJwt).
 */
function hasSession(): boolean {
  if (import.meta.server) return false
  if (!tryUseNuxtApp()) return false
  return useAuthStore().isLoggedIn
}

/** Refresh-Timer anhalten (Logout/Gast) — sonst 401-te er alle 12 min weiter. */
function stopJwtRefresh() {
  if (jwtTimer === undefined) return
  clearInterval(jwtTimer)
  jwtTimer = undefined
}

async function fetchJwt() {
  try {
    const { jwt } = await $fetch<{ jwt: string }>('/api/auth/realtime-token')
    const clients = await ensureRealtimeClients()
    // `null` = Config-Gate aus (F14) — unerreichbar, weil ensureRealtimeJwt()
    // dann gar nicht erst hierher kommt; der nullable Typ verlangt die Zeile.
    if (!clients) return
    clients.rtClient.setJWT(jwt) // NUR der Realtime-Client — nie der Cookie-Client
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
 *
 * OHNE REALTIME passiert hier NICHTS (F14): ist das Config-Gate aus, gibt es
 * keinen Socket, den man authentifizieren müsste — also auch keinen Token-Abruf.
 *
 * OHNE SESSION passiert hier NICHTS (F11): kein Token-Abruf, kein Refresh-Timer.
 * Der Socket verbindet sich als Gast und bleibt es — und das ist Absicht, kein
 * Verzicht: `read(any)`-Channels (app_config, custom_themes, öffentliche
 * Kommentare) liefern auch dem Gast Events, davon lebt das Live-Theme-Morphen.
 * Vorher holte JEDE Seite jeder auth-losen App (Marketing-Landing!) einen Token
 * für einen Nutzer, der keine Session hat → 401 pro Seitenaufruf.
 */
export function ensureRealtimeJwt(): Promise<void> {
  // Gate VOR der Session-Frage: eine App ohne Realtime braucht auch für einen
  // eingeloggten Nutzer keinen Token (F14).
  if (!realtimeEnabled()) return Promise.resolve()
  // Synchron anstoßen, solange der Nuxt-Kontext noch steht (Config-Lesen).
  void ensureRealtimeClients()
  if (!hasSession()) {
    stopJwtRefresh()
    return Promise.resolve()
  }
  if (!jwtPromise) {
    jwtPromise = fetchJwt()
    // `??=`: syncRealtimeAuth nullt jwtPromise bei jedem Auth-Wechsel — ohne
    // diesen Wächter legte jeder Login einen ZWEITEN Refresh-Timer an.
    jwtTimer ??= setInterval(() => { void fetchJwt() }, JWT_REFRESH_MS)
  }
  return jwtPromise
}

/**
 * Realtime-Auth an den Auth-State koppeln (Plugin realtime-auth.client ruft das
 * bei jedem user-Wechsel). Ohne diesen Hook bliebe der memoizierte jwtPromise
 * nach Gast→Login dauerhaft „kein JWT" (keine Presence-Upserts, keine
 * read("users")-Events bis zum nächsten 12-min-Refresh) bzw. nach Logout die
 * WS bis zu 15 min als der alte User authentifiziert.
 *
 * Nach dem JWT-Wechsel wird die offene WS einmal neu verbunden: die SDK-Realtime
 * re-subscribed beim `connected` ALLE aktiven Subscriptions selbst
 * (handleResponseConnected, am 26.1.0-Quellcode verifiziert) — Konsumenten
 * verlieren nichts, die neue Verbindung trägt aber den neuen (oder keinen) JWT.
 *
 * WICHTIG (B4): dieser Hook lädt das SDK NICHT nach. Hat bis hierher niemand
 * Realtime benutzt (`clientsPromise === null`), gibt es weder Socket noch
 * Client, den man umauthentifizieren müsste — ein Login auf einer Seite ohne
 * Abonnement soll keine 76 kB nachziehen. Der erste echte Konsument holt sich
 * seinen JWT ohnehin selbst über ensureRealtimeJwt().
 */
export async function syncRealtimeAuth(loggedIn: boolean): Promise<void> {
  jwtPromise = null
  jwtReady = false
  // Ausgeloggt ⇒ Timer aus. Sonst liefe der 12-min-Refresh nach dem Logout
  // ewig gegen /api/auth/realtime-token → 401 (F11, gleiche Wurzel).
  if (!loggedIn) stopJwtRefresh()
  if (!clientsPromise) return
  const { rtClient, realtime } = await clientsPromise
  rtClient.setJWT('')
  if (loggedIn) await ensureRealtimeJwt()
  // closeSocket ist im d.ts privat, existiert aber stabil — Reconnect übernimmt
  // die SDK (Backoff + Re-Subscribe). Kein Socket offen → no-op.
  const internal = realtime as unknown as { closeSocket?: () => Promise<void>, socket?: unknown }
  if (internal.socket && internal.closeSocket) await internal.closeSocket().catch(() => {})
}
