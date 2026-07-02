import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Wirft, wenn die Aktion den LETZTEN Admin entfernen/aussperren würde.
 * Es muss immer mindestens ein Admin übrig bleiben.
 */
export async function assertNotLastAdmin(event: H3Event, targetUserId: string): Promise<void> {
  const admin = createAdminClient(event)

  // Server-seitig nach dem Label filtern statt alle User zu paginieren:
  // total > 1 heißt, es bliebe in jedem Fall ein Admin übrig. Nur beim
  // einzigen Admin muss geprüft werden, ob er das Ziel der Aktion ist.
  const res = await admin.users.list({
    queries: [Query.contains('labels', 'admin'), Query.limit(2)],
  })
  if (res.total > 1) return

  const only = res.users[0]
  if (only && only.$id === targetUserId) {
    throw createError({ status: 400, statusText: 'At least one admin must remain', data: { code: 'last_admin' } })
  }
}
