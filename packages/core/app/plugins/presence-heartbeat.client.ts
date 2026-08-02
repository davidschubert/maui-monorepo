/**
 * Startet die globale Presence-Autorität: sobald ein User eingeloggt ist,
 * upsertet usePresenceState() dessen Presence (Appwrite Presences API) und hält
 * sie per Heartbeat am Leben — damit gilt jeder eingeloggte User app-weit als
 * „online", unabhängig von der Seite. Produkt-Composables (Thread, Moderation,
 * Edit) setzen nur scope/action derselben Presence.
 *
 * Server-Expiry räumt Abwesenheit ab (kein leave bei beforeunload → kein
 * Flackern beim Reload).
 *
 * NICHT AUF EINER FEHLERSEITE (Befund 3 des M13-Wechselwirkungs-Audits).
 * Auf einem abuse-gesperrten oder unbekannten Host wirft `00.tenant.ts` für
 * JEDEN Pfad 404 — auch für `/api/presence/heartbeat`. Die Fehlerseite selbst
 * rendert trotzdem mit hydriertem Auth-Store (Nuxt lässt für sie den internen
 * `/__nuxt_error`-Durchgang durch die Mandanten-Middleware, C12b), also fand
 * `usePresenceState()` einen eingeloggten User und feuerte alle 20 Sekunden
 * einen POST, der garantiert 404 wird — verschluckt vom `.catch(() => {})`,
 * sichtbar nur im Netzwerk-Log, und das für jeden offenen Tab auf einer
 * gesperrten Adresse. Anwesenheit auf einer Seite, die es nicht gibt, ist auch
 * fachlich nichts: es gibt dort keinen Mandanten, in dem jemand anwesend sein
 * könnte.
 *
 * NACHGEHOLT, NICHT VERWORFEN: `clearError()`/eine Navigation weg von der
 * Fehlerseite räumt `useError()` — dann startet der Heartbeat doch noch. Ein
 * blosses `if (error.value) return` würde einen Tab, der EINMAL auf einer
 * 404 gelandet ist, für den Rest der Sitzung unsichtbar machen.
 * `usePresenceState()` ist idempotent (Modul-Flag), ein doppelter Aufruf
 * kostet also nichts.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const error = useError()
  const start = () => nuxtApp.runWithContext(() => { usePresenceState() })

  if (!error.value) {
    start()
    return
  }

  const stop = watch(error, (current) => {
    if (current) return
    stop()
    start()
  })
})
