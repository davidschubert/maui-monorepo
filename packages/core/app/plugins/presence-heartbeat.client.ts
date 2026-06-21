/**
 * Hält die globale Presence des eingeloggten Users am Leben: Heartbeat alle
 * ~20s (als online gilt serverseitig, wer < 45s gepingt hat). Beim Schließen
 * des Tabs ein sendBeacon-„leave", damit der Online-Zähler sofort fällt.
 * Startet/stoppt automatisch mit dem Login-Status.
 */
const HEARTBEAT_MS = 20_000

export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  let timer: ReturnType<typeof setInterval> | undefined

  function beat() {
    if (auth.user) void $fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {})
  }

  watch(() => auth.user?.$id, (id) => {
    clearInterval(timer)
    if (id) {
      beat()
      timer = setInterval(beat, HEARTBEAT_MS)
    }
  }, { immediate: true })

  window.addEventListener('beforeunload', () => {
    if (auth.user) navigator.sendBeacon('/api/presence/leave')
  })
})
