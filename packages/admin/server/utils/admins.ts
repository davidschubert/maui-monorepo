import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Wirft, wenn die Aktion den LETZTEN Admin entfernen/aussperren würde.
 * Es muss immer mindestens ein Admin übrig bleiben.
 */
export async function assertNotLastAdmin(event: H3Event, targetUserId: string): Promise<void> {
  const admin = createAdminClient(event)
  const res = await admin.users.list({ queries: [Query.limit(100)] })
  const admins = res.users.filter(u => u.labels?.includes('admin'))

  const targetIsAdmin = admins.some(u => u.$id === targetUserId)
  const otherAdmins = admins.filter(u => u.$id !== targetUserId)

  if (targetIsAdmin && otherAdmins.length === 0) {
    throw createError({ status: 400, statusText: 'At least one admin must remain', data: { code: 'last_admin' } })
  }
}
