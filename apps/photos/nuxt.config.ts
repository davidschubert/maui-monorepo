export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Feature Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json streichen);
  // core + system bilden das Fundament und bleiben immer.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/media', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (Konvention: 3001 reddit-comments, 3002+ weitere)
  devServer: {
    port: 3003,
  },

  // Editorial-Design der Site (Port aus nuxt-maui-photos): eigene CSS-Tokens,
  // gescopet auf body.photos-site (site-Layout) — Login/Dashboard behalten
  // den Standard-Look. Cormorant Garamond self-hostet @nuxt/fonts über die
  // font-family-Deklaration in photos.css (Registry-Muster, kein Google-Link).
  css: ['~/assets/css/photos.css'],

  app: {
    head: {
      meta: [{ name: 'theme-color', content: '#0b0c0e' }],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  runtimeConfig: {
    // Empfänger des Kontakt-Formulars (Override: NUXT_CONTACT_EMAIL);
    // Versand über den Core-Mailer (NUXT_SMTP_*, lokal Mailpit)
    contactEmail: 'hello@maui.photos',
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
