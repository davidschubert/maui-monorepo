import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'

const currentDir = dirname(fileURLToPath(import.meta.url))

// Build-Identität für /api/health (Deploy-Verifikation, A.5-Härtung):
// zur BUILD-Zeit aus git gelesen — ploi baut aus dem Repo, CI ebenso.
// Kein git verfügbar (z. B. Docker-Kontext ohne .git) → '' (Health zeigt null).
function resolveBuildSha(): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: currentDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  }
  catch {
    return ''
  }
}

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
    // hreflang/canonical-Basis für useLocaleHead (SEO-Zweisprachigkeit trotz
    // Cookie-Redirects): Skeleton leer — die App setzt zur Laufzeit
    // NUXT_PUBLIC_I18N_BASE_URL (= ihre öffentliche URL). Ohne Wert bleiben
    // die Alternate-Links relativ (lokal ok, Prod setzt die Env).
    baseUrl: '',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'all',
      // BEWUSST kein fallbackLocale: Requests OHNE Signal (kein Cookie, kein
      // Accept-Language — v. a. Crawler) wurden sonst auch auf /de/* auf EN
      // gezwungen (falsches og:locale/canonical, EN-Content unter /de).
      // Ohne Fallback bleibt die URL-Locale die Autorität; Besucher mit
      // Cookie/Browser-Sprache verhalten sich unverändert.
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
    // server-only! Entitlement-Zustellung (F3/M8-Vorbereitung): URL des
    // Control-Plane-Dokuments (leer = Pull aus, Gates neutral) + kid→Public-
    // Key-Map (JSON, SPKI-DER base64). Env: NUXT_ENTITLEMENTS_URL /
    // NUXT_ENTITLEMENTS_PUBLIC_KEYS — Keys erzeugt scripts/entitlements-keygen.mjs
    entitlementsUrl: '',
    entitlementsPublicKeys: '',
    // server-only! Alert-Empfänger für Betriebs-Mails (L6: Health-Sweep-
    // Statuswechsel im Studio; Beschluss 2026-07-17: mail@davidschubert.com).
    // Leer = keine Alert-Mails. Env: NUXT_ALERT_EMAIL — Versand best-effort
    // über den Core-Mailer (ohne SMTP still no-op).
    alertEmail: '',
    // server-only! Geteilter Rate-Limit-Store (OPEN-ITEMS #8, Beschluss
    // 2026-07-22: Redis auf app-prod). Leer = In-Memory pro Instanz (Dev/
    // Single-Instanz unverändert). Env: NUXT_REDIS_URL, z. B.
    // redis://127.0.0.1:6379 — ALLE Sites eines Servers teilen die Instanz,
    // die Keys sind pro Appwrite-Projekt gescoped (keine App-Kollisionen).
    redisUrl: '',
    public: {
      // Deployter Commit (Build-Zeit aus git) — /api/health spiegelt ihn,
      // der Deploy-Workflow verifiziert damit, dass ploi den erwarteten
      // Stand wirklich gebaut hat (verschluckte Webhooks fallen sofort auf)
      buildSha: resolveBuildSha(),
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
