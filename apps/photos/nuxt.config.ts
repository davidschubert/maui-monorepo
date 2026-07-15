export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Feature Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json streichen);
  // core + system bilden das Fundament und bleiben immer.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/media', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (Konvention: 3001 reddit-comments, 3002+ weitere)
  devServer: {
    port: 3003,
  },

  // Editorial-Design der Site (Port aus nuxt-maui-photos): eigene CSS-Tokens
  // + Cormorant Garamond. TODO (Polish): Font auf die self-hostende
  // fonts.css-Registry des Core umziehen (statt Google-Link).
  css: ['~/assets/css/photos.css'],

  app: {
    head: {
      meta: [{ name: 'theme-color', content: '#0b0c0e' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&display=swap' },
      ],
    },
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
