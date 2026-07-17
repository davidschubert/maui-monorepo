import { runHealthSweep } from '../utils/siteHealth'

/**
 * Health-Automatik (M6-T4, L6-Grundstein): prüft alle registrierten Sites
 * im Intervall — gleiches Muster wie der core-Digest-Sweep (setInterval
 * statt experimenteller Nitro-scheduledTasks, Single-Instanz-Annahme).
 * Erst-Lauf kurz nach dem Boot, damit das Register nicht bis zum ersten
 * Intervall auf „unknown" steht; manuell bleibt POST /api/studio/sites/:id/
 * health. Geloggt wird nur, wenn sich etwas ändert oder etwas nicht ok ist
 * — Alerting (E-Mail, L6) dockt später genau hier an.
 */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
const FIRST_RUN_DELAY_MS = 15 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    void runHealthSweep().then((result) => {
      if (result.notOk.length || result.changed.length) {
        console.info(`[studio] Health-Sweep: ${result.checked} geprüft · nicht ok: ${result.notOk.join(', ') || '—'} · geändert: ${result.changed.join(', ') || '—'}`)
      }
    }).catch((error) => {
      console.error('[studio] Health-Sweep fehlgeschlagen:', (error as Error).message)
    })
  }

  const firstRun = setTimeout(sweep, FIRST_RUN_DELAY_MS)
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS)
  // Nitro räumt den Prozess beim Shutdown ab — unref, damit die Timer einen
  // sauberen Exit (CLI/Tests) nicht offen halten.
  firstRun.unref?.()
  timer.unref?.()
})
