/**
 * Koppelt die geteilte Realtime-Verbindung an den Auth-State: bei Login JWT
 * holen + WS neu verbinden (sonst bliebe sie bis zum nächsten Refresh Gast —
 * keine Presence-Upserts/read("users")-Events), bei Logout JWT verwerfen + WS
 * neu verbinden (sonst bliebe sie bis zu 15 min als alter User authentifiziert).
 *
 * `immediate: false` — den Erststart übernimmt ensureRealtimeJwt() der
 * Konsumenten selbst; hier geht es nur um WECHSEL während der Session.
 */
export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  watch(() => auth.user?.$id, (id, oldId) => {
    if (id === oldId) return
    void syncRealtimeAuth(!!id)
  })
})
