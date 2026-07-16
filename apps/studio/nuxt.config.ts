export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Feature Layer vor dem Core.
  // Nicht benötigte Layer einfach entfernen (und aus package.json streichen);
  // core + system bilden das Fundament und bleiben immer.
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/studio', '../../packages/core', '../../packages/system'],

  // Port pro App eindeutig vergeben (Konvention: 3001 reddit-comments, 3002+ weitere)
  devServer: {
    port: 3004,
  },

  // Eigene Keys der App — werden mit den Core-Locales gemergt (gleicher code)
  i18n: {
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },
})
