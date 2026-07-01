/**
 * Presence sofort entfernen (Tab schließt / Seite verlässt) — per
 * navigator.sendBeacon aufgerufen. Ohne diesen Weg bliebe der User bis zur
 * Expiry (~120s) „online". Best effort; fehlt der User, ist nichts zu tun.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) return { ok: true }
  try {
    const { presences } = createAdminClient(event)
    await presences.delete({ presenceId: user.$id })
  }
  catch {
    // schon weg / abgelaufen → egal
  }
  return { ok: true }
})
