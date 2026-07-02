export interface AccountRealtimeEvent {
  events: string[]
  payload: unknown
}

interface RealtimeMessage {
  type: string
  data: { events?: string[], payload?: unknown }
}

/**
 * Realtime auf dem `account`-Channel des eingeloggten Users — Session- und
 * Account-Änderungen (z.B. ein Admin beendet die Sessions, Login/Logout auf
 * einem anderen Gerät).
 *
 * BEWUSST ein eigener, COOKIE-authentifizierter nativer WebSocket — NICHT die
 * geteilte JWT-Realtime (useRealtimeClient), anders als useRealtimeRows. Grund:
 * das Instant-Session-Revoke-Signal hängt an der Cookie-Auth. Wird die Session
 * server-seitig widerrufen, schließt Appwrite genau diese cookie-gebundene WS
 * (→ onClose feuert sofort). Ein JWT bleibt bis zum Ablauf gültig; auf der
 * JWT-WS käme dieses Signal NICHT an. Daher hier nicht konsolidieren.
 *
 * - SSR: no-op (import.meta.server Guard)
 * - Reconnect mit Backoff, solange der Scope lebt
 * - Cleanup via onScopeDispose
 */
export function useRealtimeAccount(
  callback: (event: AccountRealtimeEvent) => void,
  options: { onClose?: () => void } = {},
): () => void {
  if (import.meta.server) return () => {}

  const config = useRuntimeConfig()
  const base = config.public.appwriteEndpoint.replace(/^http/, 'ws')
  const url = `${base}/realtime?project=${encodeURIComponent(config.public.appwriteProjectId)}&channels[]=account`

  let socket: WebSocket | null = null
  let disposed = false
  let attempts = 0
  // Stand schon mal eine Verbindung? onClose feuert nur dann als Auth-Signal —
  // ein fehlgeschlagener Connect-Versuch (Netz/CSP) darf keinen Logout-Check auslösen.
  let opened = false
  let openedAt = 0
  // Erst eine Verbindung, die so lange stand, gilt als stabil und resettet den
  // Backoff. Ein open→sofort-close-Muster (z.B. degradierter Realtime-Worker)
  // bliebe sonst in einem ewigen 1s-Reconnect-Loop hängen.
  const STABLE_MS = 5_000

  function handleMessage(raw: string) {
    let message: RealtimeMessage
    try {
      message = JSON.parse(raw) as RealtimeMessage
    }
    catch {
      return
    }
    if (message.type !== 'event') return
    callback({ events: message.data.events ?? [], payload: message.data.payload })
  }

  function scheduleReconnect() {
    if (disposed) return
    const delay = Math.min(1000 * 2 ** attempts, 15_000)
    attempts += 1
    setTimeout(connect, delay)
  }

  function connect() {
    if (disposed) return
    // new WebSocket() kann synchron werfen (CSP/mixed-content) → Backoff statt Crash.
    try {
      socket = new WebSocket(url)
    }
    catch {
      scheduleReconnect()
      return
    }
    socket.onopen = () => { opened = true; openedAt = Date.now() }
    socket.onmessage = event => handleMessage(String(event.data))
    socket.onclose = () => {
      if (disposed) return
      // Wird die eigene Session widerrufen, schließt der Server die Verbindung,
      // bevor zuverlässig ein Event ankommt → onClose als zusätzliches Signal
      // (der Consumer prüft dann den Auth-Status). Nur feuern, wenn vorher eine
      // Verbindung stand — sonst löst ein bloß fehlgeschlagener Connect-Versuch
      // fälschlich einen Logout-Check aus.
      if (opened) {
        opened = false
        if (Date.now() - openedAt >= STABLE_MS) attempts = 0
        options.onClose?.()
      }
      scheduleReconnect()
    }
  }

  connect()

  const close = () => {
    disposed = true
    socket?.close()
    socket = null
  }

  // Aufrufer außerhalb eines EffectScopes (z.B. Plugin mit manuellem
  // Lifecycle über den Rückgabewert) lösen sonst eine Vue-Warnung aus.
  if (getCurrentScope()) onScopeDispose(close)

  return close
}
