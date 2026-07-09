import { Query } from 'node-appwrite'
import type { TicketAssignableResponse, TicketMember } from '../../../shared/types/ticket'

/** Zuweisbare Karten-Mitglieder: Admins + Moderatoren (per Anforderung). */
export default defineEventHandler(async (event): Promise<TicketAssignableResponse> => {
  requirePermission(event, 'tickets.manage')

  const { users } = createAdminClient(event)

  const [admins, moderators] = await Promise.all([
    users.list({ queries: [Query.contains('labels', 'admin'), Query.limit(50)] }),
    users.list({ queries: [Query.contains('labels', 'moderator'), Query.limit(50)] }),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not load assignable users')
  })

  const byId = new Map<string, TicketMember>()
  for (const user of [...admins.users, ...moderators.users]) {
    const avatarUrl = (user.prefs as { avatarUrl?: string })?.avatarUrl
    byId.set(user.$id, {
      id: user.$id,
      name: user.name || user.email,
      ...(typeof avatarUrl === 'string' && avatarUrl.length > 0 ? { avatarUrl } : {}),
    })
  }

  return { users: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')) }
})
