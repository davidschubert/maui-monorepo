import { runTrialSweep } from '../utils/trialSweep'

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
        console.info(`[studio] Testphasen beendet: ${result.downgraded.join(', ')}`)
      }
    }).catch((error) => {
      console.error('[studio] Testphasen-Sweep fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  setTimeout(sweep, FIRST_RUN_DELAY_MS)
  setInterval(sweep, SWEEP_INTERVAL_MS)
})
