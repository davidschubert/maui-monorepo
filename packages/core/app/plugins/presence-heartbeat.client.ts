/**
 * Hält die globale Presence des eingeloggten Users am Leben: Heartbeat alle
 * ~20s (als online gilt serverseitig, wer < 45s gepingt hat). Startet/stoppt
 * automatisch mit dem Login-Status.
 *
 * Bewusst KEIN leave bei beforeunload: Das feuert auch beim Reload und würde
 * die Row löschen, bevor die neu geladene Seite serverseitig den Zähler holt
 * (→ flackernde 0/1). Abwesenheit wird stattdessen über das 45s-Frischefenster
 * abgeräumt (echtes Tab-Schließen fällt mit ≤45s Verzögerung raus).
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
})
