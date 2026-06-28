export default defineNuxtConfig({
  // früher gelistet = höhere Priorität — Feature Layer vor dem Core
  extends: ['../../packages/themes', '../../packages/admin', '../../packages/comments', '../../packages/moderation', '../../packages/core', '../../packages/system'],

  // MDC rendert die Markdown-Changelog-Bodies (öffentliche /changelog-Seite).
  modules: ['@nuxtjs/mdc'],

  // Der Nuxt-UI-Editor (TipTap) braucht ProseMirror als EINE vorgebündelte Instanz,
  // sonst „Adding different instances of a keyed plugin" (Nuxt-UI-Editor-Doku).
  vite: {
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-gapcursor',
      ],
    },
  },

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
