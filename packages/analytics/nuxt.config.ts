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
 * SEIT v2 (2026-08-04) IST DAS DER ZWEITE WEG, NICHT MEHR DER ERSTE: die
 * Plausible-CE hat keine Sites-API (Enterprise-only, am Quellcode geprüft) —
 * eine Site je Community konnte also niemand automatisch anlegen, und die
 * Registrierung auf unserer Instanz ist zu. Deshalb gibt es eine SAMMEL-SITE
 * (`pukalani.analytics.shared`), in die alle Pool-Communities tracken;
 * „Aktivieren" ist ein Schalter in unserer eigenen Tabelle, und getrennt werden
 * die Zahlen erst bei der ABFRAGE (`event:hostname`-Filter,
 * server/api/analytics/stats.get.ts). Die eigene Site bleibt als „Erweitert"
 * und GEWINNT über den Schalter (core/shared/analyticsScript.ts).
 *
 * Eigenes Datenmodell (Table `analytics_settings`, EINE Row je Community bzw.
 * je Instanz) — kein neues communities-Feld, keine Control-Plane-Migration,
 * keine Service-Naht: die Wahrheit liegt im Runtime-Projekt, dort wo sie
 * gelesen wird. Extended den Core NICHT selbst.
 */
export default defineNuxtConfig({
  runtimeConfig: {
    /**
     * server-only! Env-Mapping: NUXT_ANALYTICS_STATS_API_KEY — Plausible-Key
     * für `POST /api/v2/query` (Zahlen im Dashboard, v2).
     *
     * Er steht in `runtimeConfig` und NICHT unter `public`, und das ist keine
     * Formsache: der Schlüssel liest die Statistik JEDER Site auf unserer
     * Instanz. Im Client-Bundle wäre er die Erlaubnis für jeden Besucher, die
     * Zahlen aller Kunden abzurufen. Er verlässt den Server nie — die Route
     * fragt Plausible, der Client bekommt nur die fertigen Zahlen; `site_id`
     * und Filter baut ausschließlich der Server (shared/analyticsStats.ts).
     *
     * Leer = die Statistik ist „gerade nicht erreichbar" (die Seite lebt
     * weiter, die MESSUNG läuft unabhängig davon).
     */
    analyticsStatsApiKey: '',
  },

  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
