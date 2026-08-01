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
  modules: ['@nuxt/ui', '@nuxt/image', '@pinia/nuxt', '@nuxtjs/i18n'],

  // Bild-Naht Schritt 2 (C14). Im Layer, damit JEDE App `<NuxtImg>` erbt —
  // dasselbe Muster wie @nuxt/fonts, das über @nuxt/ui mitkommt.
  //
  // DER DEFAULT-ANBIETER IST `appwrite`, UND ZWAR GLOBAL — nicht nur je
  // Aufrufstelle. Zwei Gründe, beide wichtig:
  //  1. Ohne gesetzten Anbieter fällt @nuxt/image auf `ipx` zurück und
  //     registriert einen `/_ipx/**`-Handler, der Bilder AUF DEM APP-SERVER
  //     rechnet (module.js:363). Genau das soll hier nie passieren — der
  //     Server steht neben sieben Apps, und `ipx`/`sharp` sind deshalb in
  //     pnpm-workspace.yaml ausgeschlossen. Ein App-eigenes
  //     `image.provider: 'ipx'` würde den Build brechen; das ist die
  //     gewünschte Lautstärke.
  //  2. Der Anbieter ist gutmütig: was keine Appwrite-Datei ist (statische
  //     Bilder, fremde CDNs), reicht er unverändert durch. Global gesetzt
  //     kostet er also nichts und fängt trotzdem jede Aufrufstelle ein.
  //
  // AVIF steht BEWUSST NICHT in `format`: die Messung (2026-07-31, Zahlen an
  // STORAGE_PREVIEW_DEFAULT_FORMAT) hat den Aufpreis nicht getragen. Damit
  // erzeugt auch `<NuxtPicture>` nur WebP-Quellen; wer AVIF will, sagt es je
  // Bild (`format="avif"`).
  //
  // `densities: [1, 2]` ist der Nuxt-Default, hier nur festgehalten, weil er
  // die Kosten bestimmt: jede Breite × jede Dichte ist EINE Variante, die
  // Appwrite einmal rechnen und dauerhaft cachen muss. Aufrufstellen sollen
  // deshalb wenige `sizes`-Stufen nennen, nicht alle Bildschirmklassen.
  image: {
    provider: 'appwrite',
    providers: {
      appwrite: {
        name: 'appwrite',
        // Absoluter Pfad — relative Angaben löst @nuxt/image gegen die APP auf,
        // nicht gegen den Layer (dasselbe Problem wie bei `css` weiter unten).
        provider: join(currentDir, './app/providers/appwrite.ts'),
      },
    },
    quality: 78,
    format: ['webp'],
    densities: [1, 2],
  },

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

  // Stabiles Fehler-Envelope für /api (server/error.ts) — externe API-Konsumenten.
  //
  // ACHTUNG (Audit-Befund B2, 2026-07-27): NICHT als `nitro: { errorHandler }`
  // setzen! @nuxt/nitro-server 4.4.8 registriert seinen EIGENEN Nitro-Handler
  // (der die gebrandete error.vue rendert) nur, wenn das Feld noch leer ist
  // (dist/index.mjs:402: `if (!nitroConfig.errorHandler && …)`). Ein Wert in
  // der nuxt.config verdrängte ihn also — übrig blieb Nitros eingebauter
  // `internal/error/prod`, der IMMER rohes JSON schickt (nitropack 2.13.4).
  // Damit gab es faktisch keine 404-Seite. Deshalb hängen wir uns hier VOR
  // die bestehende Kette: `nitro:config` läuft NACH Nuxts Zuweisung
  // (callHook in @nuxt/nitro-server erst später), Nitro erlaubt ein Array und
  // ruft die Handler in Reihenfolge, bis einer geantwortet hat (event.handled).
  hooks: {
    'nitro:config': (nitroConfig) => {
      const ownHandler = join(currentDir, './server/error.ts')
      const existing = nitroConfig.errorHandler
      const chain = existing === undefined
        ? []
        : (Array.isArray(existing) ? existing : [existing])
      if (chain.includes(ownHandler)) return
      nitroConfig.errorHandler = [ownHandler, ...chain]
    },
  },

  // Skeleton mit Leer-Defaults (Typ-Inferenz) — echte Werte aus .env der App.
  // Der API Key ist server-only und gehört NIE in public.*
  runtimeConfig: {
    appwriteKey: '',
    // server-only! Env-Mapping: NUXT_AI_KEY — API-Key für aiComplete()
    // (OpenRouter- oder anderer OpenAI-kompatibler Anbieter, Gate: pukalani.ai)
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
    // Statuswechsel im Control; Beschluss 2026-07-17: mail@davidschubert.com).
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
      tenancy: {
        // Kontroll-Hosts der Multi-Tenant-App (Kundenbereich/Onboarding),
        // kommagetrennt: NUXT_PUBLIC_TENANCY_CONTROL_HOSTS. Laufzeit-Override
        // von pukalani.tenancy.controlHosts — die Hosts unterscheiden sich je
        // Umgebung (lokal app.localhost, Prod app.pukalani.app).
        controlHosts: '',
      },
    },
  },
})
