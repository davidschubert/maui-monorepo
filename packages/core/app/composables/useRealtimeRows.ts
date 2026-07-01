import { Channel } from 'appwrite'
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
   * Bleibt der sichere Default (winzige Datenmengen, kein Index-Zwang).
   */
  where?: (payload: T) => boolean
  /**
   * Optionale server-seitige Query-Subscription (seit Appwrite 1.9.5 self-hosted):
   * filtert schon im Realtime-Worker, nicht erst im Client. Query-Strings via
   * `Query.equal(...)` etc. Wenn gesetzt, zusätzlich zu `where` (Sicherheitsnetz).
   */
  queries?: string[]
}

/** Vom SDK an den subscribe-Callback übergebenes Event (RealtimeResponseEvent). */
interface RealtimeEventResponse {
  events?: string[]
  payload?: unknown
  channels?: string[]
}

/**
 * Realtime-Subscription auf Table-Rows über die EINE geteilte, JWT-authentifizierte
 * SDK-Realtime (useRealtimeClient). Multiplext mit Presence & allen anderen Streams
 * über denselben Socket — kein eigener Socket pro Aufruf mehr.
 *
 * - Channel via SDK-Builder: tablesdb.<db>.tables.<table>.rows[.<rowId>]
 * - SSR: no-op (import.meta.server Guard) — überall aufrufbar
 * - JWT wird vor dem Verbinden gesetzt (sonst Gast-WS ohne read("users")-Events)
 * - Cleanup via onScopeDispose — funktioniert auch in Stores/Composables
 * - Reconnect/Backoff übernimmt die SDK-Realtime
 * - Event-Match auf Suffix (.create/.update/.delete) — robust gegen den Prefix
 *   (databases.… vs. tablesdb.…) im Payload
 */
export function useRealtimeRows<T extends AppwriteRow>(
  databaseId: string,
  tableId: string,
  callback: (event: RealtimeRowEvent<T>) => void,
  options: RealtimeRowsOptions<T> = {},
): () => void {
  if (import.meta.server) return () => {}

  const channel = options.rowId
    ? Channel.tablesdb(databaseId).table(tableId).row(options.rowId)
    : Channel.tablesdb(databaseId).table(tableId).row()

  const realtime = sharedRealtime()
  let sub: { unsubscribe?: () => void, close?: () => void } | undefined
  let disposed = false

  function handle(res: RealtimeEventResponse) {
    const events = res.events ?? []
    const first = events[0] ?? ''
    const type = first.endsWith('.create')
      ? 'create'
      : first.endsWith('.update')
        ? 'update'
        : first.endsWith('.delete') ? 'delete' : null
    if (!type) return

    const payload = res.payload as T
    if (options.where && !options.where(payload)) return

    callback({ type, payload, events })
  }

  void (async () => {
    // WS authentifizieren, BEVOR sie sich verbindet (sonst Gast → keine
    // read("users")-Events, z.B. für comment_votes/notifications).
    await ensureRealtimeJwt()
    if (disposed) return
    try {
      sub = await realtime.subscribe(channel, handle as (payload: unknown) => void, options.queries)
    }
    catch { /* WS nicht verfügbar → Konsumenten haben Poll-/Refetch-Fallbacks */ }
  })()

  const close = () => {
    disposed = true
    try { (sub?.unsubscribe ?? sub?.close)?.() }
    catch { /* ignore */ }
    sub = undefined
  }

  onScopeDispose(close)

  return close
}
