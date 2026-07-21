/**
 * Feature Layer: Pages — editierbare Inhaltsseiten (Impressum/AGB/Datenschutz).
 * Betreiber pflegt sie im Dashboard (WYSIWYG via UEditor, Markdown) mit
 * Sprachversionen (EN Standard + weitere Reiter); öffentlich unter sprechenden
 * Pfaden (/impressum …) gerendert. Eigenes Datenmodell (Table pages), A14.
 * Extended den Core NICHT selbst.
 */
export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
