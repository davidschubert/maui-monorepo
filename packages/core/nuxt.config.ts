import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n'],

  // i18n: de Default ohne Prefix, en unter /en/* — DACH-Fokus (bewusste
  // Entscheidung, dass das Modul in jeder App lädt). Layer bleibt lokal
  // im Monorepo (Remote-Layer-i18n-Bug).
  i18n: {
    defaultLocale: 'de',
    strategy: 'prefix_except_default',
    detectBrowserLanguage: false,
    locales: [
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
  },

  // Absoluter Pfad statt ~/ — Aliases würden relativ zur App aufgelöst
  css: [join(currentDir, './app/assets/css/main.css')],

  // stores/ wird im Layer nicht automatisch gescannt (nur composables/ + utils/)
  imports: {
    dirs: [join(currentDir, './app/stores')],
  },

  // Skeleton mit Leer-Defaults (Typ-Inferenz) — echte Werte aus .env der App.
  // Der API Key ist server-only und gehört NIE in public.*
  runtimeConfig: {
    appwriteKey: '',
    public: {
      appwriteEndpoint: '',
      appwriteProjectId: '',
      appwriteDatabaseId: '',
      // Gegenpart zu NUXT_PUBLIC_APP_URL — ohne Skeleton-Key mappt die Env-Var ins Leere
      appUrl: '',
    },
  },
})
