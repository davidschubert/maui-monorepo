/**
 * Produkt Layer: Analytics — Selbstbedienung für Plausible.
 *
 * Der Owner einer Community (Pool) bzw. der Betreiber (Silo) hinterlegt im
 * Dashboard die Script-Id seiner Plausible-Site auf UNSERER Instanz; die App
 * baut daraus selbst das v3-Snippet im Head (core/app/plugins/analytics.ts).
 *
 * WARUM NUR EINE ID UND NIE EINE URL ODER EIN SNIPPET: alles, was der Kunde
 * hier eingibt, landet als `<script src>` in JEDER Seite seiner Community —
 * eine freie Adresse wäre damit eine Einladung, fremden Code auf einem
 * pukalani.app-Host auszuführen (und im Pool auf einem Host, dessen Cookies
 * unsere Session tragen). Die Basis-Adresse kommt deshalb aus der App-Config
 * (`pukalani.analytics.instance`), aus der Eingabe nur die geprüfte Id.
 *
 * Eigenes Datenmodell (Table `analytics_settings`, EINE Row je Community bzw.
 * je Instanz) — kein neues communities-Feld, keine Control-Plane-Migration,
 * keine Service-Naht: die Wahrheit liegt im Runtime-Projekt, dort wo sie
 * gelesen wird. Extended den Core NICHT selbst.
 */
export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
