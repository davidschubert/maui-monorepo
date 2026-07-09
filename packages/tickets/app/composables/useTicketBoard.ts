import { TICKETS_TABLE, TICKET_LISTS_TABLE, type TicketBoardResponse, type TicketListRow, type TicketRow } from '../../shared/types/ticket'

export const TICKET_POSITION_GAP = 1000

/**
 * Board-Zustand: ein Fetch für Listen+Karten, Realtime-Refresh (geteilte
 * JWT-SDK-WS, debounct) und optimistische Moves — DnD fühlt sich sofort an,
 * PATCH + Realtime ziehen die Wahrheit nach.
 */
export function useTicketBoard() {
  const config = useRuntimeConfig()

  const { data, refresh, status, error } = useFetch<TicketBoardResponse>('/api/tickets/board', {
    key: 'tickets:board',
    lazy: true,
    server: false,
    default: () => ({ lists: [], tickets: [] }),
  })

  const lists = computed<TicketListRow[]>(() =>
    [...(data.value?.lists ?? [])].sort((a, b) => a.position - b.position))

  const ticketsByList = computed<Map<string, TicketRow[]>>(() => {
    const map = new Map<string, TicketRow[]>()
    for (const list of lists.value) map.set(list.$id, [])
    for (const ticket of data.value?.tickets ?? []) {
      const bucket = map.get(ticket.listId)
      if (bucket) bucket.push(ticket)
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.position - b.position)
    return map
  })

  // Realtime auf beide Tables — debounct, damit Massen-Updates (sort) nicht flackern
  let timer: ReturnType<typeof setTimeout> | undefined
  const debouncedRefresh = () => {
    clearTimeout(timer)
    timer = setTimeout(() => { void refresh() }, 300)
  }
  let stops: Array<() => void> = []
  onMounted(() => {
    const databaseId = config.public.appwriteDatabaseId
    stops = [
      useRealtimeRows(databaseId, TICKET_LISTS_TABLE, debouncedRefresh),
      useRealtimeRows(databaseId, TICKETS_TABLE, debouncedRefresh),
    ]
  })
  onBeforeUnmount(() => {
    clearTimeout(timer)
    for (const stop of stops) stop()
  })

  /** Einfüge-Position zwischen Nachbarn (Midpoint; Anfang = Hälfte, Ende = +GAP) */
  function positionAt(bucket: TicketRow[] | TicketListRow[], index: number, ignoreId?: string): number {
    const items = ignoreId ? bucket.filter(item => item.$id !== ignoreId) : [...bucket]
    const before = items[index - 1]
    const after = items[index]
    if (before && after) return (before.position + after.position) / 2
    if (after) return after.position / 2
    if (before) return before.position + TICKET_POSITION_GAP
    return TICKET_POSITION_GAP
  }

  /** Karte optimistisch verschieben, dann PATCH (Fehler → Refresh als Wahrheit) */
  async function moveTicket(ticket: TicketRow, listId: string, index: number) {
    const bucket = ticketsByList.value.get(listId) ?? []
    // Hover-Index zählt inkl. der gezogenen Karte — beim Zug nach rechts/unten
    // innerhalb desselben Buckets verschiebt sich der Ziel-Slot um eins
    const sourceIndex = bucket.findIndex(item => item.$id === ticket.$id)
    if (sourceIndex !== -1 && sourceIndex < index) index--
    const position = positionAt(bucket, index, ticket.$id)
    if (ticket.listId === listId && ticket.position === position) return
    ticket.listId = listId
    ticket.position = position
    // useFetch-data ist in Nuxt 4 SHALLOW — ohne Re-Assign rendert die
    // optimistische Mutation erst mit dem Realtime-Refetch (~1s Verzögerung)
    data.value = { ...data.value! }
    try {
      await $fetch(`/api/tickets/${ticket.$id}`, { method: 'PATCH', body: { listId, position } })
    }
    catch {
      await refresh()
    }
  }

  /** Liste optimistisch verschieben (index in der Ziel-Reihenfolge) */
  async function moveList(list: TicketListRow, index: number) {
    const sourceIndex = lists.value.findIndex(item => item.$id === list.$id)
    if (sourceIndex !== -1 && sourceIndex < index) index--
    const position = positionAt(lists.value, index, list.$id)
    if (list.position === position) return
    list.position = position
    data.value = { ...data.value! }
    try {
      await $fetch(`/api/tickets/lists/${list.$id}`, { method: 'PATCH', body: { position } })
    }
    catch {
      await refresh()
    }
  }

  return { data, lists, ticketsByList, refresh, status, error, moveTicket, moveList, positionAt }
}
