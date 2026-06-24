import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * Wirft, wenn die Aktion den LETZTEN Admin entfernen/aussperren würde.
 * Es muss immer mindestens ein Admin übrig bleiben.
 */
export async function assertNotLastAdmin(event: H3Event, targetUserId: string): Promise<void> {
  const admin = createAdminClient(event)
  const PAGE = 100
  const adminIds = new Set<string>()

  // ALLE User paginieren — bei >100 Usern wäre ein einzelner Page-Aufruf blind für
  // einen Admin jenseits Zeile 100 (falscher Lockout-Block oder umgangene Garantie).
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const res = await admin.users.list({ queries: [Query.limit(PAGE), Query.offset(offset)] })
    for (const u of res.users) {
      if (u.labels?.includes('admin')) adminIds.add(u.$id)
    }
    if (res.users.length < PAGE || offset + PAGE >= res.total) break
  }

  const targetIsAdmin = adminIds.has(targetUserId)
  const otherAdmins = [...adminIds].filter(id => id !== targetUserId)

  if (targetIsAdmin && otherAdmins.length === 0) {
    throw createError({ status: 400, statusText: 'At least one admin must remain', data: { code: 'last_admin' } })
  }
}
