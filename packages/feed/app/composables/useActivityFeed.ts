import { ACTIVITIES_TABLE, type Activity, type FeedActivity, type FeedListResponse } from '../../shared/types/activity'

/**
 * Zustand + Laden des Activity-Feeds: erste Seite SSR-hydriert (useFetch),
 * weitere Seiten per Cursor, neue/gelöschte Einträge live über die geteilte
 * SDK-Realtime (Cleanup manuell wie NotificationBell — Subscribe erst im
 * Mount, damit SSR ein no-op bleibt).
 *
 * In <script setup> mit await aufrufen (useFetch-Konvention). WICHTIG:
 * alle Lifecycle-Hooks werden VOR dem ersten await registriert — nach dem
 * await gibt es in async setup keine aktive Component-Instanz mehr und
 * onMounted/onBeforeUnmount würden still verpuffen (kein Realtime).
 */
export async function useActivityFeed() {
  const config = useRuntimeConfig()

  const rows = ref<FeedActivity[]>([])
  const nextCursor = ref<string | null>(null)

  // Alles Stoppbare einsammeln — onBeforeUnmount räumt gesammelt auf
  const stops: Array<() => void> = []
  onMounted(() => {
    stops.push(useRealtimeRows<Activity>(
      config.public.appwriteDatabaseId,
      ACTIVITIES_TABLE,
      (ev) => {
        if (ev.type === 'create') {
          // Dedupe gegen parallel laufendes load/refresh
          if (rows.value.some(row => row.$id === ev.payload.$id)) return
          rows.value = [ev.payload, ...rows.value]
        }
        if (ev.type === 'delete') {
          rows.value = rows.value.filter(row => row.$id !== ev.payload.$id)
        }
      },
    ))
  })
  onBeforeUnmount(() => {
    for (const stop of stops) stop()
    stops.length = 0
  })

  const { data, pending, error, refresh } = await useFetch<FeedListResponse>('/api/feed')
  // Watcher entsteht NACH dem await (außerhalb des Component-Scopes) →
  // manuell stoppen (onBeforeUnmount oben), sonst leakt er pro Navigation.
  stops.push(watch(data, (value) => {
    if (!value) return
    rows.value = value.rows
    nextCursor.value = value.nextCursor
  }, { immediate: true }))

  const loadingMore = ref(false)
  async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return
    loadingMore.value = true
    try {
      const res = await $fetch<FeedListResponse>('/api/feed', { query: { cursor: nextCursor.value } })
      // Dedupe: Realtime kann Einträge bereits vorn eingefügt haben
      const known = new Set(rows.value.map(row => row.$id))
      rows.value = [...rows.value, ...res.rows.filter(row => !known.has(row.$id))]
      nextCursor.value = res.nextCursor
    }
    finally {
      loadingMore.value = false
    }
  }

  /** Eintrag löschen (Moderation, feed.manage) — Route ist die Autorität. */
  async function remove(id: string) {
    await $fetch(`/api/feed/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter(row => row.$id !== id)
  }

  return { rows, pending, error, refresh, nextCursor, loadingMore, loadMore, remove }
}
