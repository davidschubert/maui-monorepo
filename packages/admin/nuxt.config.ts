/**
 * Feature Layer: Admin-Dashboard (Grundgerüst + User-Verwaltung).
 * Eigene Table: `changelog` (A14). Administriert außerdem Appwrite-User und
 * die Daten anderer Layer (Moderation). Extended den Core nicht selbst —
 * die App komponiert: extends: [admin, comments, core].
 */
export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
