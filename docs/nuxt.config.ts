// Docs-App (eigenständig, KEIN Maui-Layer): rendert docs/content/* als
// durchsuchbare Doku-Site nach dem Vorbild des Nuxt-UI-Docs-Templates.
// Bewusst außerhalb von apps/* — sie braucht weder Appwrite noch
// Site-Manifest (check-manifests scannt nur apps/ + packages/).
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/content'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  content: {
    build: {
      markdown: {
        toc: { searchDepth: 1 },
      },
    },
    experimental: {
      // node:sqlite (Node 22.5+) — kein nativer better-sqlite3-Build nötig
      sqliteConnector: 'native',
    },
  },

  compatibilityDate: '2026-06-30',

  devServer: {
    port: 4000,
  },

  nitro: {
    prerender: {
      routes: ['/'],
      crawlLinks: true,
    },
  },
})
