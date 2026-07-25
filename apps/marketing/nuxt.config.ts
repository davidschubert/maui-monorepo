export default defineNuxtConfig({
  // Marketing-Startseite von pukalani.app (Wurzel). Schlanke App: Fundament
  // (core + system) + themes (für die Farbwelten-Vorschau + das Licht-Motiv).
  // Bewusst KEIN admin/comments/… — die Seite ist öffentlich + statisch.
  extends: ['../../packages/themes', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig (3001 comments · 3004 platform · 3005 portfolio · 3007 marketing)
  devServer: {
    port: 3007,
  },

  // Licht-Dramaturgie (§6.3 des Konzepts) — gescopet auf body.marketing-site,
  // damit sie nicht in Login/Dashboard-Layouts der Layer blutet.
  css: ['~/assets/css/marketing.css'],

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  // App-Keys mergen mit den Core-Locales (gleicher code).
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
