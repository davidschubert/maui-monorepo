export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Feature Layer vor dem Core
  extends: ['../../packages/admin', '../../packages/comments', '../../packages/core'],

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
