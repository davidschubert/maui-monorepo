import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n'],

  // i18n: en ist Default/Fallback und liegt OHNE Prefix unter '/...'; alle anderen
  // Sprachen sind geprefixt (/de/*). Die gewählte Sprache steckt damit in der URL;
  // der Cookie (i18n_redirected) hält die zuletzt gewählte Sprache geräteweit.
  // redirectOn: 'all' → JEDE Seite folgt beim Aufruf/Refresh dem Cookie (nicht nur
  // '/'), sonst behalten Nicht-Wurzel-Seiten wie /dashboard ihre URL-Sprache und
  // laufen aus dem Tritt. Tradeoff: ein Deep-Link in einer anderen als der
  // gespeicherten Sprache wird auf die Präferenz umgeleitet. Layer bleibt lokal im
  // Monorepo (Remote-Layer-i18n-Bug); das Modul lädt bewusst in jeder App.
  i18n: {
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'all',
      fallbackLocale: 'en',
    },
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'de', language: 'de-DE', name: 'Deutsch', file: 'de.json' },
    ],
  },

  // Absoluter Pfad statt ~/ — Aliases würden relativ zur App aufgelöst
  css: [join(currentDir, './app/assets/css/main.css')],

  // stores/ wird im Layer nicht automatisch gescannt (nur composables/ + utils/)
  imports: {
    dirs: [join(currentDir, './app/stores')],
  },

  // Stabiles Fehler-Envelope für /api (server/error.ts) — externe API-Konsumenten
  nitro: {
    errorHandler: join(currentDir, './server/error.ts'),
  },

  // Skeleton mit Leer-Defaults (Typ-Inferenz) — echte Werte aus .env der App.
  // Der API Key ist server-only und gehört NIE in public.*
  runtimeConfig: {
    appwriteKey: '',
    // server-only! Env-Mapping: NUXT_AI_KEY — API-Key für aiComplete()
    // (OpenRouter- oder anderer OpenAI-kompatibler Anbieter, Gate: maui.ai)
    aiKey: '',
    // server-only! SMTP für E-Mail-Notifications (server/utils/mailer.ts) —
    // leerer Host = Mail-Versand aus. Env: NUXT_SMTP_HOST/PORT/USER/PASS/FROM
    // (lokal: Mailpit localhost:1025 ohne Auth).
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    public: {
      appwriteEndpoint: '',
      appwriteProjectId: '',
      appwriteDatabaseId: '',
      // Storage-Bucket für Profilfotos (gehört der App). Leer = Foto-Upload-UI
      // ausgeblendet, bis der Bucket existiert (NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET).
      appwriteAvatarsBucket: '',
      // Storage-Bucket für GDPR-Pre-Delete-Snapshots (gehört der App). Leer =
      // Löschung läuft OHNE Snapshot (NUXT_PUBLIC_APPWRITE_GDPR_BUCKET).
      appwriteGdprBucket: '',
      // Gegenpart zu NUXT_PUBLIC_APP_URL — ohne Skeleton-Key mappt die Env-Var ins Leere
      appUrl: '',
    },
  },
})
