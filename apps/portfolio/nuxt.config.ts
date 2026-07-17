export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Feature Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json streichen);
  // core + system bilden das Fundament und bleiben immer.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (Konvention: 3001 comments, 3002+ weitere)
  devServer: {
    port: 3005,
  },

  // Portfolio-Design (Syne + Glibbergreen, DNA der alten davidschubert.com) —
  // gescopet auf body.portfolio-site (site-Layout): Login/Dashboard behalten
  // den Standard-Look. Syne self-hostet @nuxt/fonts über die font-family-
  // Deklaration im CSS (Registry-Muster, kein Google-Link).
  css: ['~/assets/css/portfolio.css'],

  app: {
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
