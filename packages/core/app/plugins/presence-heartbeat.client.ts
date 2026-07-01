/**
 * Startet die globale Presence-Autorität: sobald ein User eingeloggt ist,
 * upsertet usePresenceState() dessen Presence (Appwrite Presences API) und hält
 * sie per Heartbeat am Leben — damit gilt jeder eingeloggte User app-weit als
 * „online", unabhängig von der Seite. Feature-Composables (Thread, Moderation,
 * Edit) setzen nur scope/action derselben Presence.
 *
 * Server-Expiry räumt Abwesenheit ab (kein leave bei beforeunload → kein
 * Flackern beim Reload).
 */
export default defineNuxtPlugin(() => {
  usePresenceState()
})
