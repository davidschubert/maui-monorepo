import { Permission, Role } from 'node-appwrite'

/**
 * Heartbeat: aktualisiert die Presence-Row des Users mit frischem lastSeen.
 * scope 'global' (eingeloggt/live) oder '<type>:<id>' (in einem Thread);
 * typing kennzeichnet aktives Tippen. Upsert via Session-Client (als der User).
 * Degradiert still, falls die presence-Table fehlt (App ohne admin-Layer).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) return { ok: false }

  // readBody kann bei leerem Body undefined liefern (nicht rejecten) → absichern
  const body = (await readBody(event).catch(() => null)) as { scope?: string, typing?: boolean } | null
  const scope = typeof body?.scope === 'string' && body.scope ? body.scope : 'global'
  const typing = body?.typing === true

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const rowId = presenceRowId(user.$id, scope)
  const now = new Date().toISOString()

  try {
    await tablesDB.updateRow({
      databaseId, tableId: 'presence', rowId,
      data: { lastSeen: now, userName: user.name, typing },
    })
  }
  catch {
    try {
      await tablesDB.createRow({
        databaseId, tableId: 'presence', rowId,
        data: { userId: user.$id, userName: user.name, scope, lastSeen: now, typing },
        permissions: [Permission.update(Role.user(user.$id)), Permission.delete(Role.user(user.$id))],
      })
    }
    catch {
      // Table fehlt oder Race → ignorieren (Presence ist best effort)
    }
  }

  return { ok: true }
})
