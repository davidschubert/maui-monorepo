import type { TicketWatchingResponse } from '../../shared/types/ticket'

/**
 * „Was beobachte ich?" (P4) — geteilter Fetch (Modal-Toggle + Beobachtet-
 * Ansicht auf dem Board nutzen denselben Key/Zustand).
 */
export function useTicketWatching() {
  const { data, refresh } = useFetch<TicketWatchingResponse>('/api/tickets/watching', {
    key: 'tickets:watching',
    lazy: true,
    server: false,
    default: () => ({ ticketIds: [], tickets: [] }),
  })

  const watchedIds = computed(() => new Set(data.value?.ticketIds ?? []))
  const watchedTickets = computed(() => data.value?.tickets ?? [])
  const isWatching = (ticketId: string) => watchedIds.value.has(ticketId)

  async function toggleWatch(ticketId: string) {
    const watching = isWatching(ticketId)
    await $fetch(`/api/tickets/${ticketId}/watch`, { method: watching ? 'DELETE' : 'POST' })
    await refresh()
    return !watching
  }

  return { watchedIds, watchedTickets, isWatching, toggleWatch, refresh }
}
