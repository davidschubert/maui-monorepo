import { ANALYTICS_EVENTS, type AnalyticsEventKey } from '../../shared/analyticsEvents'

/**
 * EIN vordefiniertes Ereignis zählen (F47) — der einzige Sendeweg für Custom
 * Events. Aufgerufen wird mit dem SCHLÜSSEL, nicht dem Namen: das Vokabular
 * (core/shared/analyticsEvents.ts) ist damit die einzige Stelle, an der ein
 * Name existiert, und ein Tippfehler ist ein Typfehler statt einer stumm
 * fehlenden Zeile im Dashboard.
 *
 * NO-OP, WO NICHT GEMESSEN WIRD: `window.plausible` gibt es nur, wenn das
 * Head-Plugin das Snippet eingebunden hat (Messung aktiv, ggf. Consent
 * erteilt). Die Aufrufstellen in den Produkt-Layern müssen deshalb NICHTS
 * prüfen — auf einer Community ohne Analytics, im Silo ohne Config und auf dem
 * Kontroll-Host verpufft der Aufruf. Und er darf NIE etwas kosten: eine
 * Statistik, die einen Kommentar-Absenden-Handler wirft, wäre teurer als jede
 * fehlende Zahl.
 */
export function trackAnalyticsEvent(key: AnalyticsEventKey): void {
  if (import.meta.server) return
  const plausible = (window as { plausible?: (name: string) => void }).plausible
  if (typeof plausible !== 'function') return
  try {
    plausible(ANALYTICS_EVENTS[key])
  }
  catch {
    // Bewusst still: s. o. — die Messung ist nie wichtiger als die Handlung.
  }
}
