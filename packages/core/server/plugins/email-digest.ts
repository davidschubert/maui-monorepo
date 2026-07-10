import { runEmailDigestSweep } from '../utils/emailDigest'

/**
 * Digest-Intervall: prüft alle 30 Minuten, welche 'digest'-User fällige
 * ungelesene Notifications haben (Dueness pro User: prefs.emailDigestLastAt,
 * ~täglich — Details in emailDigest.ts). setInterval statt experimenteller
 * Nitro-scheduledTasks — Single-Instanz-Annahme wie beim Rate-Limit
 * dokumentiert; manuell auslösbar über POST /api/notifications/run-digest.
 * Ohne konfiguriertes SMTP ist der Sweep ein sofortiger no-op.
 */
const SWEEP_INTERVAL_MS = 30 * 60 * 1000

export default defineNitroPlugin(() => {
  if (!isMailerConfigured(undefined)) return
  const timer = setInterval(() => {
    void runEmailDigestSweep().then((result) => {
      if (result.sent || result.errors) {
        console.info(`[core] Digest-Sweep: ${result.sent} gesendet, ${result.skipped} übersprungen, ${result.errors} Fehler (${result.candidates} Kandidaten)`)
      }
    })
  }, SWEEP_INTERVAL_MS)
  // Nitro räumt den Prozess beim Shutdown ab — unref, damit der Timer einen
  // sauberen Exit (CLI/Tests) nicht offen hält.
  timer.unref?.()
})
