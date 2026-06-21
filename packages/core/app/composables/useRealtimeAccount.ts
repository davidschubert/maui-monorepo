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
 * einem anderen Gerät). Nativer WebSocket wie useRealtimeRows (Legacy-Protokoll,
 * self-hosted 1.9.0); authentifiziert über das Same-Origin-Session-Cookie.
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

  function connect() {
    if (disposed) return
    socket = new WebSocket(url)
    socket.onopen = () => { attempts = 0 }
    socket.onmessage = event => handleMessage(String(event.data))
    socket.onclose = () => {
      if (disposed) return
      // Wird die eigene Session widerrufen, schließt der Server die Verbindung,
      // bevor zuverlässig ein Event ankommt → onClose als zusätzliches Signal
      // (der Consumer prüft dann den Auth-Status).
      options.onClose?.()
      const delay = Math.min(1000 * 2 ** attempts, 15_000)
      attempts += 1
      setTimeout(connect, delay)
    }
  }

  connect()

  const close = () => {
    disposed = true
    socket?.close()
    socket = null
  }

  onScopeDispose(close)

  return close
}
