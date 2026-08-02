import { runTrialSweep } from '../utils/trialSweep'
import { pruneInviteRequests } from '../utils/inviteRequestPrune'
import { runPastDueSweep } from '../utils/pastDueSweep'
import { eraseStaleReporterEmails } from '../utils/abuseReportPrune'

/**
 * Testphasen-Automatik (O6): abgelaufene Trials fallen auf den kostenlosen
 * Tarif. Gleiches Muster wie der Health-Sweep (setInterval, Single-Instanz-
 * Annahme) — stündlich reicht, weil eine Testphase in Tagen rechnet und ein
 * paar Minuten Nachlauf niemandem schaden.
 *
 * Erster Lauf kurz nach dem Boot: sonst behielte ein über Nacht abgelaufener
 * Trial nach einem Deploy bis zur nächsten Stunde Pro-Limits.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    void runTrialSweep().then((result) => {
      // Nur melden, wenn wirklich etwas passiert ist — ein stündliches „0
      // Änderungen" macht das Log unlesbar.
      if (result.downgraded.length) {
        console.info(`[control] Testphasen beendet: ${result.downgraded.join(', ')}`)
      }
    }).catch((error) => {
      console.error('[control] Testphasen-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })

    // Teilt sich bewusst den Takt: beides sind stündliche Aufräumarbeiten am
    // selben Register, und ein zweiter Timer wäre nur ein zweiter Ort, an dem
    // man nach dem Grund für ein verschwundenes Datum sucht.
    void pruneInviteRequests().then((result) => {
      if (result.deleted) {
        console.info(`[control] Erledigte Anfragen gelöscht: ${result.deleted}`)
      }
    }).catch((error) => {
      console.error('[control] Anfragen-Aufräumen fehlgeschlagen:', error instanceof Error ? error.message : error)
    })

    // Dritter Mitfahrer, gleiche Begründung (M13): Zahlungsverzug rechnet in
    // TAGEN, stündlich ist also reichlich genau, und ein eigener Timer wäre nur
    // ein weiterer Ort, an dem man nach dem Grund für eine Sperre sucht. Der
    // Sweep ist idempotent — er sperrt jede Community höchstens einmal und hebt
    // auf, was nicht mehr überfällig ist.
    void runPastDueSweep().then((result) => {
      if (result.suspended.length) {
        console.warn(`[control] Wegen Zahlungsverzug gesperrt: ${result.suspended.join(', ')}`)
      }
      if (result.lifted.length) {
        console.info(`[control] Zahlungs-Sperre aufgehoben: ${result.lifted.join(', ')}`)
      }
    }).catch((error) => {
      console.error('[control] Zahlungsverzugs-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })

    // Vierter Mitfahrer (F8-Rest): Melder-Adressen verfallen nach 90 Tagen. Die
    // Frist rechnet in Tagen, stündlich ist also mehr als genau — und der Takt
    // gehört aus demselben Grund hierher wie die drei darüber: ein eigener
    // Timer wäre nur ein weiterer Ort, an dem man nach dem Grund für ein
    // verschwundenes Datum sucht.
    void eraseStaleReporterEmails().then((result) => {
      if (result.erased) {
        logEvent('info', 'abuse.reporter_email_pruned', { erased: result.erased })
      }
    }).catch((error) => {
      console.error('[control] Melder-Adressen-Aufräumen fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  setTimeout(sweep, FIRST_RUN_DELAY_MS)
  setInterval(sweep, SWEEP_INTERVAL_MS)
})
