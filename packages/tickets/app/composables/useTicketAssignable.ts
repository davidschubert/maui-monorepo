import type { TicketAssignableResponse } from '../../shared/types/ticket'

/**
 * Zuweisbare User (Admins/Mods) inkl. Avatar-URLs — geteilter Fetch-Key,
 * Karte UND Modal lösen Avatare darüber auf (membersJson bleibt schlank:
 * nur id+name, Avatare sind Anzeige-Zustand).
 */
export function useTicketAssignable() {
  const { data } = useFetch<TicketAssignableResponse>('/api/tickets/assignable', {
    key: 'tickets:assignable',
    lazy: true,
    server: false,
    default: () => ({ users: [] }),
  })

  const users = computed(() => data.value?.users ?? [])
  const avatarById = computed(() => {
    const map = new Map<string, string>()
    for (const user of users.value) {
      if (user.avatarUrl) map.set(user.id, user.avatarUrl)
    }
    return map
  })

  return { users, avatarById }
}
