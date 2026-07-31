export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Produkt Layer vor dem Core
  // feedback + tickets sind mit E10 (Davids Entscheidung 7, 2026-07-30) nach
  // apps/control gezogen — Rückmeldungen laufen zentral beim Betreiber auf.
  // Der Bestand dieser Instanz bleibt in der Tabelle `feedback` stehen
  // (Entscheidung 6: nicht migrieren, nicht löschen); gesichert wird er vorher
  // mit packages/feedback/scripts/backup-feedback.mjs.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/blueprint', '../../packages/comments', '../../packages/posts', '../../packages/events', '../../packages/media', '../../packages/billing', '../../packages/courses', '../../packages/activity', '../../packages/moderation', '../../packages/core', '../../packages/system'],

  // MDC-Modul + ProseMirror-Prebundling bringt der admin-Layer selbst mit.

  devServer: {
    port: 3001,
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
