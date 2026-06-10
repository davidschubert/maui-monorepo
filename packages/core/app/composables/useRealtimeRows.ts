import type { AppwriteRow } from '../../shared/types/appwrite'

export interface RealtimeRowEvent<T extends AppwriteRow> {
  type: 'create' | 'update' | 'delete'
  payload: T
  events: string[]
}

export interface RealtimeRowsOptions<T extends AppwriteRow> {
  /** Nur Events einer einzelnen Row */
  rowId?: string
  /**
   * Client-seitiger Event-Filter, z.B. payload => payload.postId === id.
   * Server-seitige Query-Subscriptions sind Stand 06/2026 Cloud-only —
   * sobald self-hosted sie kann, wird das hier auf Queries umgestellt.
   */
  where?: (payload: T) => boolean
}

interface RealtimeMessage {
  type: string
  data: {
    events?: string[]
    payload?: unknown
  }
}

/**
 * Realtime-Subscription auf Table-Rows — bewusst auf nativem WebSocket
 * statt Web SDK: Die SDK-Versionen mit TablesDB-Channels sprechen das neue
 * Realtime-Protokoll (Connect ohne Channels + dynamische Subscribe-Messages),
 * das self-hosted 1.9.0 mit "Missing channels" ablehnt. Das Legacy-Protokoll
 * (channels[] in der Connect-URL) ist stabil und funktioniert in Browser
 * UND Node. Same-Origin-Cookie (A3) macht die Verbindung authentifiziert.
 *
 * - SSR: no-op (import.meta.server Guard) — überall aufrufbar
 * - Cleanup via onScopeDispose — funktioniert auch in Stores/Composables
 * - Reconnect mit Backoff, solange der Scope lebt
 * - Achtung: Channel-Prefix ist tablesdb.…, die Event-Strings im Payload
 *   weiterhin databases.… — deshalb Match auf Event-SUFFIX (.create etc.)
 */
export function useRealtimeRows<T extends AppwriteRow>(
  databaseId: string,
  tableId: string,
  callback: (event: RealtimeRowEvent<T>) => void,
  options: RealtimeRowsOptions<T> = {},
): () => void {
  if (import.meta.server) return () => {}

  const config = useRuntimeConfig()

  const channel = options.rowId
    ? `tablesdb.${databaseId}.tables.${tableId}.rows.${options.rowId}`
    : `tablesdb.${databaseId}.tables.${tableId}.rows`

  const base = config.public.appwriteEndpoint.replace(/^http/, 'ws')
  const url = `${base}/realtime?project=${encodeURIComponent(config.public.appwriteProjectId)}&channels[]=${encodeURIComponent(channel)}`

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

    const events = message.data.events ?? []
    const first = events[0] ?? ''
    const type = first.endsWith('.create')
      ? 'create'
      : first.endsWith('.update')
        ? 'update'
        : first.endsWith('.delete') ? 'delete' : null
    if (!type) return

    const payload = message.data.payload as T
    if (options.where && !options.where(payload)) return

    callback({ type, payload, events })
  }

  function connect() {
    if (disposed) return
    socket = new WebSocket(url)
    socket.onopen = () => { attempts = 0 }
    socket.onmessage = event => handleMessage(String(event.data))
    socket.onclose = () => {
      if (disposed) return
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
