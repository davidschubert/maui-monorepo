import { pruneGuestAuthors } from '../utils/guestAuthorPrune'

/**
 * Takt für die Aufbewahrungsfrist der Gast-Kontaktdaten (Audit-Befund
 * 2026-08-01). Muster und Begründung wie beim Melder-Adressen-Sweep im
 * control-Layer: die Frist rechnet in TAGEN, stündlich ist also mehr als genau,
 * und der erste Lauf kommt kurz nach dem Boot, damit ein Deploy die fällige
 * Runde nicht bis zur vollen Stunde verschiebt.
 *
 * Single-Instanz-Annahme wie bei allen Sweeps hier: laufen mehrere Instanzen,
 * löschen sie dieselben Zeilen — das ist idempotent und kostet höchstens einen
 * 404 im `catch` des Sweeps.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const FIRST_RUN_DELAY_MS = 30 * 1000

export default defineNitroPlugin(() => {
  const sweep = () => {
    void pruneGuestAuthors().then((result) => {
      // Nur melden, wenn wirklich etwas passiert ist — ein stündliches
      // „0 Zeilen" macht das Log unlesbar.
      if (result.deleted) {
        logEvent('info', 'comments.guest_authors_pruned', { deleted: result.deleted })
      }
    }).catch((error) => {
      console.error('[comments] Gast-Kontaktdaten-Aufräumen fehlgeschlagen:', error instanceof Error ? error.message : error)
    })
  }

  setTimeout(sweep, FIRST_RUN_DELAY_MS)
  setInterval(sweep, SWEEP_INTERVAL_MS)
})
