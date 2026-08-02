import type { AppwriteRow } from '../../shared/types/appwrite'
import { realtimeAllowed } from '../../shared/realtimeGate'

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
 * - Das Web-SDK wird ERST HIER dynamisch geladen (B4). Wer nie abonniert, lädt
 *   es nie; wer abonniert, zahlt es nach der Hydration statt im Initial-Bundle.
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

  /**
   * OHNE DATENEBENE — ODER OHNE REALTIME-GATE — GIBT ES NICHTS ZU ABONNIEREN.
   *
   * Zwei Gründe, eine Regel (shared/realtimeGate.ts):
   *
   * (1) DIE DATENEBENE (Live-Vorfall 2026-07-29). Apps wie `help` und
   *     `marketing` erben den core-Layer, haben aber bewusst KEINE Appwrite-
   *     Instanz — `appwriteDatabaseId` ist dort der leere Default. Der
   *     SDK-Kanalbau (`Channel.tablesdb('')`) wirft dann „Channel ID is
   *     required". Weil das in einem PLUGIN passiert (realtime-config.client.ts,
   *     realtime-themes.client.ts), macht Nuxt daraus einen fatalen
   *     App-Start-Fehler: help.pukalani.app lieferte HTTP 200 mit sauberem
   *     SSR-HTML, und der Browser malte trotzdem eine 500-Seite darüber — der
   *     Server war nie das Problem.
   * (2) DAS CONFIG-GATE `pukalani.realtime.enabled` (F14, 2026-08-01). Eine
   *     Datenbank-Id in der .env heißt noch nicht, dass die App etwas davon
   *     will: die Marketing-Seite trägt eine (der system-Layer bootet damit)
   *     und abonnierte deshalb `app_config`-Flags, die sie nirgends liest —
   *     samt nachgeladenem Web-SDK und Gast-WebSocket auf einer statischen
   *     Landingpage.
   *
   * Der Guard steht bewusst HIER und nicht in den Plugins: sonst muss sich
   * jeder künftige Aufrufer daran erinnern. Eine Stelle entscheidet, ob
   * Realtime überhaupt möglich ist.
   */
  if (!realtimeAllowed(realtimeEnabled(), databaseId, tableId)) return () => {}

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

  // ensureRealtimeJwt() SYNCHRON anstoßen (noch im Composable-Setup): es liest
  // die Runtime-Config, und nach dem ersten await ist der Nuxt-Kontext weg.
  const jwtReady = ensureRealtimeJwt()

  void (async () => {
    // Direkt destrukturiert, nicht über Promise.all oder einen Helfer — sonst
    // verliert Rollup die Tree-Shaking-Information (s. useRealtimeClient.ts).
    const { Channel } = await import('appwrite')
    const realtime = await sharedRealtime()
    // `null` = Config-Gate aus. Der Guard oben hat das längst abgefangen; der
    // Typ verlangt die Zeile trotzdem — genau dafür ist er nullable (F14).
    if (disposed || !realtime) return
    const channel = options.rowId
      ? Channel.tablesdb(databaseId).table(tableId).row(options.rowId)
      : Channel.tablesdb(databaseId).table(tableId).row()

    // WS authentifizieren, BEVOR sie sich verbindet (sonst Gast → keine
    // read("users")-Events, z.B. für comment_votes/notifications).
    await jwtReady
    if (disposed) return
    try {
      sub = await realtime.subscribe(channel, handle as (payload: unknown) => void, options.queries)
      // Scope könnte WÄHREND des subscribe-Awaits disposed worden sein →
      // sofort wieder abbestellen, sonst feuert der Callback ewig weiter.
      if (disposed) { void (sub.unsubscribe ?? sub.close)?.(); sub = undefined }
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
