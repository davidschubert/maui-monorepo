import type { MauiAdminModule } from '../shared/types/admin-module'

export default defineAppConfig({
  // maui.* Config-Gates: Core-Default ist IMMER aus — Apps aktivieren explizit.
  // Interne Tools bleiben komplett clean, öffentliche Seiten brauchen 3 Zeilen.
  maui: {
    admin: {
      /** Modul-Registry: Feature-Layer tragen hier ihre Dashboard-Sektionen ein
       *  (deep-merged/konkateniert über alle Layer). Das Dashboard-Layout rendert
       *  die Nav daraus, capability-gefiltert. */
      modules: [] as MauiAdminModule[],
    },
    ai: {
      /** Server-seitige KI-Features (aiComplete: Moderations-Assist, Layer-
       *  Defaults). Core-Default aus; Key server-only via NUXT_AI_KEY. */
      enabled: false,
      /** Model-Id der OpenAI-kompatiblen Chat-Completions-API (Default: OpenRouter) */
      model: 'anthropic/claude-haiku-4.5',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
    auth: {
      /** Social-Login-Buttons (z.B. ['github', 'google']) — leer = keine Buttons.
       *  Provider müssen in der Appwrite Console konfiguriert sein! */
      providers: [] as string[],
      /** AGB-URL — gesetzt = Pflicht-Checkbox im Register-Formular */
      termsUrl: '',
      /** Passwortloser Login per E-Mail-Code (Appwrite Email-OTP) —
       *  Ergänzung zum Passwort-Login, kein Ersatz */
      otp: false,
      /** Nicht-blockierende E-Mail-Verifizierung: Signup verschickt eine
       *  Bestätigungs-Mail (Instanz-SMTP), eingeloggt erscheint ein Banner
       *  bis zur Bestätigung. E-Mail-Notifications (instant/digest) gehen
       *  IMMER nur an verifizierte Adressen — unabhängig von diesem Flag
       *  (Spam-Schutz). OTP-Logins verifizieren automatisch. */
      verification: true,
    },
    analytics: {
      enabled: false,
      provider: 'plausible' as 'plausible' | 'umami',
      /** plausible: data-domain · umami: data-website-id */
      domain: '',
      websiteId: '',
      /** Eigene Script-URL (z.B. self-hosted) — leer = Provider-Default */
      src: '',
    },
    consent: {
      enabled: false,
    },
    /** Footer-Rechtslinks (Impressum/AGB/Datenschutz o. ä.). Core-Default leer
     *  → das Standard-Layout zeigt keine; Apps mit öffentlichen Seiten füllen
     *  sie (to = interner Pfad via localePath, labelKey = i18n-Key). */
    legalLinks: [] as { to: string, labelKey: string }[],
    security: {
      /** CSRF-Origin-Check für unsichere Methoden auf /api/* (server/middleware/
       *  csrf-origin.ts). PFLICHT, sobald eine App das partitionierte
       *  Embed-Session-Cookie (SameSite=None, Embed-Plan E2) aktiviert —
       *  bis dahin schützt sameSite:'strict' und der Check bleibt aus. */
      csrfOriginCheck: false,
    },
    observability: {
      /** Strukturierte JSON-Error-Logs für unbehandelte Server-Fehler (5xx)
       *  am zentralen Nitro-Error-Hook. Sentry-Andockpunkt: server/utils/logEvent.ts */
      enabled: false,
      /** Browser-Fehler (vue:error, window.onerror, unhandledrejection)
       *  zusätzlich an POST /api/telemetry/error melden (dedupliziert, max 10/Session) */
      clientErrors: false,
    },
  },
  ui: {
    // Nuxt UI v4 gibt Buttons per Default KEINEN Pointer-Cursor — global nachrüsten,
    // damit anklickbare Buttons (inkl. variant="link" wie "Code erneut senden") sich
    // auch wie klickbar anfühlen. Im disabled-Zustand greift weiterhin not-allowed.
    button: {
      slots: {
        base: 'cursor-pointer'
      }
    },
    colors: {
      primary: 'sky',
      // Basis-Neutral (Fallback); zur Laufzeit überschreibt der Neutral-Picker
      // via [data-neutral] die --ui-color-neutral-Ramp (siehe themes/neutral.css)
      neutral: 'mist'
    },
    icons: {
      arrowDown: 'i-ph-arrow-down',
      arrowLeft: 'i-ph-arrow-left',
      arrowRight: 'i-ph-arrow-right',
      arrowUp: 'i-ph-arrow-up',
      caution: 'i-ph-warning-circle',
      check: 'i-ph-check',
      chevronDoubleLeft: 'i-ph-caret-double-left',
      chevronDoubleRight: 'i-ph-caret-double-right',
      chevronDown: 'i-ph-caret-down',
      chevronLeft: 'i-ph-caret-left',
      chevronRight: 'i-ph-caret-right',
      chevronUp: 'i-ph-caret-up',
      close: 'i-ph-x',
      copy: 'i-ph-copy',
      copyCheck: 'i-ph-check-circle',
      dark: 'i-ph-moon',
      drag: 'i-ph-dots-six-vertical',
      ellipsis: 'i-ph-dots-three',
      error: 'i-ph-x-circle',
      external: 'i-ph-arrow-up-right',
      eye: 'i-ph-eye',
      eyeOff: 'i-ph-eye-slash',
      file: 'i-ph-file',
      folder: 'i-ph-folder',
      folderOpen: 'i-ph-folder-open',
      hash: 'i-ph-hash',
      info: 'i-ph-info',
      light: 'i-ph-sun',
      loading: 'i-ph-circle-notch',
      menu: 'i-ph-list',
      minus: 'i-ph-minus',
      panelClose: 'i-ph-sidebar-simple',
      panelOpen: 'i-ph-sidebar-simple',
      plus: 'i-ph-plus',
      reload: 'i-ph-arrow-counter-clockwise',
      search: 'i-ph-magnifying-glass',
      stop: 'i-ph-square',
      success: 'i-ph-check-circle',
      system: 'i-ph-monitor',
      tip: 'i-ph-lightbulb',
      upload: 'i-ph-upload',
      warning: 'i-ph-warning'
    }
  }
})
