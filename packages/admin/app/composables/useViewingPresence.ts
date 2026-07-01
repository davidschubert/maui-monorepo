/**
 * Betrachtungs-Presence fürs Dashboard: broadcastet die aktuelle Seite (route.path)
 * als presence `page` und leitet daraus ab, wer dieselbe Seite ansieht. Deckt
 * „anderer Admin schaut denselben User/dieses Dashboard an" (others) UND die
 * Live-Betrachterzahl pro Seite (count) ab. `page` ist ein eigenes metadata-Feld,
 * unabhängig von `action` (editing/reviewing) — kollidiert also nicht.
 */
export function useViewingPresence() {
  const route = useRoute()
  const state = usePresenceState()
  const { user } = useCurrentUser()
  const { present } = usePresence()

  watchEffect(() => state.setPage(route.path))
  onScopeDispose(() => state.setPage(undefined))

  const viewers = computed(() => present.value.filter(u => u.page === route.path))
  const others = computed(() => viewers.value.filter(u => u.userId !== user.value?.$id))

  return { viewers, others, count: computed(() => viewers.value.length) }
}
