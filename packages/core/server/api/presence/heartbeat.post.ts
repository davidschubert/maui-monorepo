/**
 * Presence-Heartbeat (SSR-Cookie-Architektur): Der Browser kann seine eigene
 * Presence NICHT selbst schreiben — der Web-SDK-Client hat keine Session
 * (httpOnly-Cookie authentifiziert weder den Realtime-WS noch PUT /presences),
 * daher upserten wir sie hier server-seitig mit dem Admin-Client. Der Reader
 * (usePresence) liest weiterhin direkt über die Presences-API (Cookie-GET).
 *
 * Eine Presence pro User (presenceId = userId); metadata trägt scope/action/
 * typing. Kurze Expiry (90s) → verlässt der User die Seite, räumt der Server ab.
 */
// Server-Expiry > Frische-Fenster (180s): eine „frische" Presence darf nie schon
// abgelaufen sein, sonst würde sie zwischen zwei gedrosselten Heartbeats server-
// seitig verschwinden (Flackern). 240s hält Puffer über die Drossel-Lücke.
const PRESENCE_TTL_MS = 240_000

export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const body = await readBody(event).catch(() => ({})) as {
    scope?: unknown
    action?: unknown
    typing?: unknown
    page?: unknown
    replyingTo?: unknown
    near?: unknown
    away?: unknown
  }

  const prefs = user.prefs as { avatarUrl?: string } | undefined
  const metadata: Record<string, unknown> = { userName: user.name }
  if (typeof prefs?.avatarUrl === 'string' && prefs.avatarUrl) metadata.avatarUrl = prefs.avatarUrl
  if (typeof body.scope === 'string') metadata.scope = body.scope
  if (typeof body.action === 'string') metadata.action = body.action
  if (body.typing === true) metadata.typing = true
  if (typeof body.page === 'string') metadata.page = body.page
  if (typeof body.replyingTo === 'string') metadata.replyingTo = body.replyingTo
  if (typeof body.near === 'string') metadata.near = body.near
  if (body.away === true) metadata.away = true

  try {
    const { presences } = createAdminClient(event)
    await presences.upsert({
      presenceId: user.$id,
      userId: user.$id,
      status: 'online',
      // read("users"): andere eingeloggte User sehen die Presence.
      // update/delete für den Owner: Appwrites Realtime-Presence-Handler
      // (Presences/State.php) UPDATEt die Presence beim WS-Verarbeiten — ohne
      // diese Rechte wirft er „No permissions for action 'update'" und der
      // Realtime-Pfad bricht ab (nur read würde die Owner-Defaults verdrängen).
      permissions: [
        `read("users")`,
        `update("user:${user.$id}")`,
        `delete("user:${user.$id}")`,
      ],
      expiresAt: new Date(Date.now() + PRESENCE_TTL_MS).toISOString(),
      metadata,
    })
  }
  catch {
    // best effort — Presence ist eine flüchtige Zusatzschicht, kein Kernpfad
  }

  return { ok: true }
})
