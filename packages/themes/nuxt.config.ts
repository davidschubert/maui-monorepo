/**
 * Feature Layer: Multi-Theme-System (siehe design-system Notiz).
 * Core liefert EIN Default-Theme — dieses Layer ergänzt umschaltbare
 * Themes als statische CSS-Dateien (public/themes/*) mit Cookie-
 * Persistenz. Keine eigenen Tables, keine Runtime-CSS-Generierung.
 */
export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
