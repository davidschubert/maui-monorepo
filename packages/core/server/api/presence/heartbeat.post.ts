import { Permission, Role } from 'node-appwrite'

/**
 * Heartbeat: aktualisiert die Presence-Row des Users (scope 'global') mit
 * frischem lastSeen. Upsert via Session-Client (schreibt als der User).
 * Degradiert still, falls die presence-Table fehlt (App ohne admin-Layer).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) return { ok: false }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const now = new Date().toISOString()

  try {
    await tablesDB.updateRow({
      databaseId, tableId: 'presence', rowId: user.$id,
      data: { lastSeen: now, userName: user.name },
    })
  }
  catch {
    try {
      await tablesDB.createRow({
        databaseId, tableId: 'presence', rowId: user.$id,
        data: { userId: user.$id, userName: user.name, scope: 'global', lastSeen: now },
        permissions: [Permission.update(Role.user(user.$id)), Permission.delete(Role.user(user.$id))],
      })
    }
    catch {
      // Table fehlt oder Race → ignorieren (Presence ist best effort)
    }
  }

  return { ok: true }
})
