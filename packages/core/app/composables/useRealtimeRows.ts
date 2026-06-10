import { Channel } from 'appwrite'
import type { AppwriteRow } from '../../shared/types/appwrite'

export interface RealtimeRowEvent<T extends AppwriteRow> {
  type: 'create' | 'update' | 'delete'
  payload: T
  events: string[]
}

/**
 * Realtime-Subscription auf Table-Rows (Web SDK, client-only).
 * - SSR: no-op (import.meta.server Guard) — überall aufrufbar
 * - Cleanup via onScopeDispose — funktioniert auch in Stores/Composables
 * - Achtung: Channel-Prefix ist tablesdb.…, die Event-Strings im Payload
 *   weiterhin databases.… — deshalb Match auf Event-SUFFIX (.create etc.)
 */
export function useRealtimeRows<T extends AppwriteRow>(
  databaseId: string,
  tableId: string,
  callback: (event: RealtimeRowEvent<T>) => void,
  rowId?: string,
): () => void {
  if (import.meta.server) return () => {}

  const { realtime } = useAppwriteClient()

  const channel = rowId
    ? Channel.tablesdb(databaseId).table(tableId).row(rowId)
    : Channel.tablesdb(databaseId).table(tableId).row()

  // subscribe() liefert ein Promise — Cleanup muss die Auflösung abwarten
  const subscription = realtime.subscribe(channel, (response) => {
    const evt = response.events[0] ?? ''
    const type: RealtimeRowEvent<T>['type'] = evt.endsWith('.create')
      ? 'create'
      : evt.endsWith('.update') ? 'update' : 'delete'

    callback({
      type,
      payload: response.payload as T,
      events: response.events,
    })
  })

  const close = () => {
    subscription.then(sub => sub.close()).catch(() => {})
  }

  onScopeDispose(close)

  return close
}
