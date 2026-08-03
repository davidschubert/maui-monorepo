import { createPastDueNoticeReader } from '../../../../packages/control/server/utils/pastDueNoticeReader'
import { registerPastDueNoticeReader, runPastDueNoticeSweep } from '../../../../packages/onboarding/server/utils/pastDueNotice'

/**
 * A14-Komposition: die Zahlungswarnung eines COMMUNITY-Abos gehört in die
 * Glocke des Owners auf SEINEM Community-Host (Davids Entscheidung vom
 * 2026-08-03) — und die hängt in diesem Projekt, nicht im Control Plane.
 * Deshalb steht der Lauf hier und nicht beim Stripe-Webhook; die ganze
 * Begründung (samt der Alternative, die verworfen wurde) steht im Kopf von
 * packages/onboarding/server/utils/pastDueNotice.ts.
 *
 * Die App verdrahtet die zwei Hälften, wie sie es bei den Resolvern tut:
 *  - LESEN gehört dem control-Layer (`communities` + `community_members`,
 *    Cross-Projekt-Read mit demselben read-only-Key wie tenant-resolver.ts),
 *  - SCHREIBEN gehört dem onboarding-Layer (`notify()` im Pool-Projekt dieser App).
 *
 * EIGENES PLUGIN, nicht bei tenant-resolver.ts mitgefahren: dort werden
 * Resolver REGISTRIERT (kein Timer, keine Nebenwirkung). Ein setInterval in
 * derselben Datei wäre ein zweiter Sorte Arbeit unter einer Überschrift, die
 * etwas anderes verspricht.
 *
 * TAKT wie bei den Control-Sweeps: stündlich, erster Lauf kurz nach dem Boot.
 * Der Verzug rechnet in Tagen (14 bis zur Sperre), eine Stunde Nachlauf ist
 * belanglos — und ohne den frühen ersten Lauf verschöbe jeder Deploy die
 * Warnung um bis zu eine Stunde.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 45 * 1000

export default defineNitroPlugin(() => {
  const endpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
  const projectId = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
  const databaseId = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
  const apiKey = process.env.NUXT_PLATFORM_CONTROL_KEY
  if (!endpoint || !projectId || !databaseId || !apiKey) {
    // Dieselbe Bedingung wie beim Tenant-Resolver: ohne Control-Env läuft diese
    // App als Single-Tenant, dann gibt es keine Community-Abos zu melden.
    // Die Warnung dort genügt — zwei identische Zeilen im Boot-Log helfen nicht.
    return
  }

  // Registriert statt durchgereicht: die Ops-Route
  // (POST /api/community/billing/run-past-due-notice) braucht denselben Leser,
  // und ein zweites Argument hieße ein zweiter Ort, der den Schlüssel kennt.
  registerPastDueNoticeReader(createPastDueNoticeReader({ endpoint, projectId, apiKey, databaseId }))

  const sweep = () => {
    void runPastDueNoticeSweep().then((result) => {
      // Nur melden, wenn wirklich etwas passiert ist — ein stündliches
      // „0 Warnungen" macht das Log unlesbar.
      if (result.notified.length) {
        console.warn(`[platform] Zahlungswarnung zugestellt: ${result.notified.join(', ')}`)
      }
    }).catch((error) => {
      console.error('[platform] Zahlungswarnungs-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  setTimeout(sweep, FIRST_RUN_DELAY_MS)
  setInterval(sweep, SWEEP_INTERVAL_MS)
})
