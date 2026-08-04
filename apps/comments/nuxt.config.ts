export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Produkt Layer vor dem Core
  // feedback + tickets sind mit E10 (Davids Entscheidung 7, 2026-07-30) nach
  // apps/control gezogen — Rückmeldungen laufen zentral beim Betreiber auf.
  // Der Bestand dieser Instanz bleibt in der Tabelle `feedback` stehen
  // (Entscheidung 6: nicht migrieren, nicht löschen); gesichert wird er vorher
  // mit packages/feedback/scripts/backup-feedback.mjs.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/blueprint', '../../packages/comments', '../../packages/posts', '../../packages/events', '../../packages/media', '../../packages/billing', '../../packages/courses', '../../packages/activity', '../../packages/moderation', '../../packages/analytics', '../../packages/core', '../../packages/system'],

  // MDC-Modul + ProseMirror-Prebundling bringt der admin-Layer selbst mit.

  devServer: {
    port: 3001,
  },

  /**
   * DevTools bleiben im normalen Dev-Betrieb AN — nur der E2E-Kontext schaltet
   * sie ab (`PW_E2E`, gesetzt vom webServer in playwright.config.ts).
   *
   * WARUM (F9-Rest, 2026-08-01): das DevTools-Abzeichen schwebt über jeder
   * Seite und trägt eine bei jedem Laden andere ms-Zahl. Es steckte in allen
   * NEUN Theme-Baselines und fiel nur deshalb nicht auf, weil
   * `maxDiffPixelRatio` groß genug war, es zu verschlucken — ein Netz, das
   * Rauschen duldet, duldet auch echte Regressionen.
   *
   * WARUM HIER: `devtools` ist eine BUILD-Option, kein runtimeConfig — sie
   * lässt sich nur beim Start entscheiden, nicht pro Request. Und warum
   * env-gesteuert statt fest aus: beim täglichen Entwickeln sind die DevTools
   * nützlich, der Testlauf ist der Sonderfall. E2E fährt gegen den DEV-Server
   * (auch in CI), deshalb greift ein Dev-Schalter überhaupt.
   */
  devtools: { enabled: !process.env.PW_E2E },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
