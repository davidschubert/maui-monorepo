/**
 * Betrachtungs-Presence fürs Dashboard: broadcastet die aktuelle Seite als
 * presence `page` und leitet daraus ab, wer dieselbe Seite ansieht. Deckt
 * „anderer Admin schaut denselben User/dieses Dashboard an" (others) UND die
 * Live-Betrachterzahl pro Seite (count) ab. `page` ist ein eigenes metadata-Feld,
 * unabhängig von `action` (editing/reviewing) — kollidiert also nicht.
 *
 * Der Key ist locale-frei normalisiert ('/de/dashboard/users' → '/dashboard/users'),
 * damit zwei Admins auf verschiedenen Sprachen dieselbe Seite teilen.
 */
export function useViewingPresence() {
  const route = useRoute()
  const { locales } = useI18n()
  const state = usePresenceState()
  const { user } = useCurrentUser()
  const { present } = usePresence()

  const codes = computed(() => (locales.value as Array<string | { code: string }>).map(l => (typeof l === 'string' ? l : l.code)))
  const pageKey = computed(() => route.path.replace(new RegExp(`^/(${codes.value.join('|')})(?=/|$)`), '') || '/')

  watchEffect(() => state.setPage(pageKey.value))
  onScopeDispose(() => state.setPage(undefined))

  const viewers = computed(() => present.value.filter(u => u.page === pageKey.value))
  const others = computed(() => viewers.value.filter(u => u.userId !== user.value?.$id))

  return { viewers, others, count: computed(() => viewers.value.length) }
}
