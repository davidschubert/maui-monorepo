/**
 * Interner Sweep-Endpoint (E3) — Andockpunkt für eine scheduled Appwrite
 * Function (Scaffold Track 2B), die den Reminder-Sweep auch OHNE Seiten-
 * besuche auslöst. Key-geschützt über NUXT_EVENTS_SWEEP_KEY (server-only);
 * ohne konfigurierten Key ist der Endpoint deaktiviert (404 — kein
 * Orakel für Unbefugte).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const key = config.eventsSweepKey
  if (!key) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (getHeader(event, 'x-sweep-key') !== key) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  await sweepEventReminders(event)
  return { ok: true }
})
