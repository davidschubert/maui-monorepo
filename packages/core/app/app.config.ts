import type { PukalaniAdminModule } from '../shared/types/admin-module'
import type { PukalaniAdminNoticeConfig } from '../shared/types/admin-notice'
import type { PukalaniChromeNavConfig, PukalaniChromeUtilityConfig } from '../shared/types/chrome'

export default defineAppConfig({
  // pukalani.* Config-Gates: Core-Default ist IMMER aus — Apps aktivieren explizit.
  // Interne Tools bleiben komplett clean, öffentliche Seiten brauchen 3 Zeilen.
  pukalani: {
    /**
     * Name im Dashboard-Kopf. War bis 2026-07-26 als „Hawaii Studio" im
     * admin-Layer festverdrahtet — und damit stand der Firmenname des
     * BETREIBERS auch im Dashboard jeder Kunden-Community. Der Default hier
     * ist bewusst neutral; jede App setzt ihren eigenen.
     *
     * OFFEN: auf einem Mandanten-Host gehört hier der Community-Name hin. Der
     * ist heute nur serverseitig bekannt (useTenant) — ihn in die Client-
     * Payload zu heben ist ein eigener kleiner Schritt.
     */
    brand: {
      name: 'Pukalani',
      /**
       * Öffentliche Seite des Anbieters (absolute URL) — der EINZIGE Leser ist
       * heute die Fehlerseite eines unbekannten Hosts (C12b): wer sich
       * vertippt hat, landet auf einer Adresse ohne Community, und „Zur
       * Startseite" führte dort im Kreis. Leer = kein Ausweg-Link (Silo-Apps
       * haben keinen Anbieter-Auftritt, auf den sie verweisen müssten).
       */
      homeUrl: '',
    },
    admin: {
      /** Modul-Registry: Produkt-Layer tragen hier ihre Dashboard-Sektionen ein
       *  (deep-merged/konkateniert über alle Layer). Das Dashboard-Layout rendert
       *  die Nav daraus, capability-gefiltert. */
      modules: [] as PukalaniAdminModule[],
      /**
       * Hinweis-Registry der Dashboard-ÜBERSICHT (M13, s. shared/types/
       * admin-notice.ts): Produkt-Layer melden hier eine global registrierte
       * Komponente an, die oben auf /dashboard erscheint, wenn sie etwas zu
       * sagen hat. Leer = die Übersicht bleibt wie bisher.
       *
       * Der Ort ist die Übersicht und NICHT die Dashboard-Hülle: ein Banner im
       * Layout stünde auf jeder einzelnen Unterseite und wäre nach dem zweiten
       * Klick Tapete. Die Übersicht ist die Landeseite jeder Rolle — einmal
       * gesehen, sichtbar so lange es gilt.
       */
      notices: {} as PukalaniAdminNoticeConfig,
    },
    /**
     * Chrome-Registry (Audit S9): Header-Nav + Header-Utilities der
     * öffentlichen Community-Seiten. Produkt-Layer registrieren sich selbst
     * (Objekt-Map, Key = stabile ID; `false` schaltet einen Eintrag ab —
     * s. shared/types/chrome.ts). Konsument ist das blueprint-default-Layout;
     * das core-default-Layout bleibt bewusst registry-frei (marketing & Co.).
     */
    chrome: {
      nav: {} as PukalaniChromeNavConfig,
      utilities: {
        // Benachrichtigungen sind Core-Funktionalität — core registriert
        // seine eigene Glocke (nur eingeloggt), alle anderen Utilities
        // kommen aus den Produkt-Layern.
        notifications: { component: 'NotificationBell', order: 40, requiresAuth: true },
      } as PukalaniChromeUtilityConfig,
      /** Footer-Link auf /changelog — der admin-Layer (Besitzer der Seite)
       *  schaltet ihn an; Apps können ihn wieder abschalten (platform). */
      changelogLink: false,
      /** CMS-Seiten als Nav-/Footer-Quelle — registriert der pages-Layer;
       *  ohne ihn macht das Layout keinen /api/pages/public-Fetch. */
      pagesNav: false,
      /**
       * Die Glocke in den EIGENEN Shells: core-default-Layout (Kundenbereich)
       * + Dashboard-Shell (Betreiber). BEWUSST ein eigener Schalter und nicht
       * `utilities.notifications` — den liest nur das blueprint-Layout, also
       * die öffentlichen Community-Seiten (C17, 2026-07-29).
       *
       * WARUM ES DEN SCHALTER BRAUCHT: eine App ohne blueprint (apps/control)
       * hat gar kein Community-Chrome; dort schreibt der Stripe-Webhook und
       * das Control Plane kontobezogene Meldungen (`scope: 'account'`), und
       * niemand konnte sie lesen — geschrieben, zugestellt, unsichtbar. Der
       * Core-Default bleibt AUS, damit die blueprint-Apps nicht zwei Glocken
       * bekommen und interne Apps (marketing, help) keine ohne Zweck.
       *
       * Was die Glocke ZEIGT, entscheidet sie selbst über das Publikum
       * ihres Hosts (shared/notificationScope.ts) — dieser Schalter sagt nur,
       * OB sie hängt, nie WAS sie zeigt.
       */
      accountBell: false,
    },
    /**
     * Demo-Host-Gate (CoreDemoBanner + CorePlanBadge): auf diesen Hosts ist
     * die Site eine Demo mit Beispiel-Inhalten — Banner oben, Plan-Badges an
     * den Produkten. Leer = beides existiert nicht. Bewusst KEIN Tenant-Feld:
     * der Demo-Status ist eine Deployment-Aussage der App.
     */
    demo: {
      hosts: [] as string[],
      /** CTA in den Self-Service-Trichter (absolute URL) — leer = kein CTA */
      ctaUrl: '',
    },
    ai: {
      /** Server-seitige KI-Produkte (aiComplete: Moderations-Assist, Layer-
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
    seo: {
      /**
       * Basis-URL für canonical/hreflang/og:url aus dem REQUEST-Host statt aus
       * `NUXT_PUBLIC_I18N_BASE_URL` (useLocaleSeoHead). Core-Default AUS:
       * Single-Host-Apps haben genau eine öffentliche URL, und die soll die Env
       * bestimmen (auch für Aliase — control kanonisiert bewusst auf control).
       *
       * AN gehört das Gate in jede App, die MEHRERE Hosts bedient: die Env kann
       * nur einen tragen, weshalb auf allen Mandanten-Hosts der Pool-App der
       * Betreiber-Host in canonical/hreflang/og:url stand (Audit-Befund B1) —
       * Google indexierte die Kundendomain nicht, Sprachlinks verließen den
       * Mandanten. Das Schema bleibt Sache der Env (shared/seoOrigin.ts).
       */
      originFromRequest: false,
      /**
       * Bildmarke pro Mandant (Audit-Befund K2): `<link rel="icon">` auf die
       * serverseitig generierte `/favicon.svg` (Kreis in der Primärfarbe des
       * Mandanten-Themes + Initial) plus `<meta name="theme-color">` in
       * derselben Farbe. Core-Default AUS — eine Silo-App hat ein eigenes,
       * gestaltetes Favicon und darf es nicht verlieren.
       *
       * AN gehört das Gate in Apps, die viele Communities auf einem Deployment
       * bedienen: dort lieferte jeder Kunden-Host Nitros 78-Byte-Platzhalter
       * aus. Die App MUSS dann eine Route `/favicon.svg` mitbringen
       * (apps/platform/server/routes/favicon.svg.get.ts).
       */
      tenantFavicon: false,
      /**
       * Vorschaubild pro Mandant für geteilte Links (og:image, OPEN-ITEMS B2):
       * `/og/<key>.png` — 1200×630, Basisfarbe des Community-Themes,
       * Community-Name, dezente Wortmarke. Core-Default AUS.
       *
       * WARUM PNG und nicht das vorhandene SVG der Bildmarke: Facebook,
       * WhatsApp und LinkedIn ignorieren ein SVG als og:image vollständig.
       * Gerastert wird ohne Renderer im Betrieb — Chrome hat die Zeichen
       * EINMAL gebacken (packages/themes/scripts/generate-brand-card-font.mjs),
       * der Server setzt sie nur zusammen und legt das Bild auf Platte.
       *
       * AN gehört das Gate in Mehr-Host-Apps, die eine Route `/og/[key]`
       * mitbringen (apps/platform/server/routes/og/[key].get.ts). Silo-Apps
       * bleiben aus: die haben EIN Erscheinungsbild und können sich ein
       * gestaltetes Bild leisten.
       */
      tenantOgImage: false,
      /**
       * App-Icon pro Mandant für den Home-Bildschirm (OPEN-ITEMS C7):
       * `/icon/<key>.png` — randlose Kachel in der Basisfarbe des
       * Community-Themes + Initiale, 512×512 und 180×180 (`?size=180`).
       * Core-Default AUS.
       *
       * EIGENES Gate neben `tenantFavicon`, obwohl beides „die Bildmarke im
       * Browser" ist: das Favicon ist ein generiertes SVG und kostet nichts,
       * das Icon wird gerastert und auf Platte abgelegt. Vor allem aber bringt
       * eine Silo-App oft ein gestaltetes Touch-Icon mit — die soll das
       * Favicon-Gate anschalten können, ohne ihr Icon zu verlieren.
       *
       * WARUM PNG: iOS akzeptiert als `apple-touch-icon` ausschließlich
       * Bitmaps; aus dem SVG der Bildmarke ist das nicht ableitbar. Ohne diese
       * Zeile legt iOS einen Screenshot der Seite auf den Home-Bildschirm.
       *
       * AN gehört das Gate in Mehr-Host-Apps, die eine Route `/icon/[key]`
       * mitbringen (apps/platform/server/routes/icon/[key].get.ts).
       */
      tenantAppIcon: false,
    },
    tenancy: {
      /** Horizont-3 Mandanten-Auflösung (Naht 1): Host → TenantContext via
       *  registriertem Resolver (registerTenantResolver, Nitro-Plugin der
       *  Platform-App). Core-Default AUS — Single-Tenant-Apps (heutiger
       *  Betrieb) tragen null Overhead; bei aktivem Gate ohne Resolver bleibt
       *  die Middleware ein No-Op (fail-open auf heutiges Verhalten). */
      enabled: false,
      /**
       * KONTROLL-Hosts: Hostnamen derselben App, die bewusst KEIN Mandant sind
       * (Kundenbereich/Onboarding, z. B. app.pukalani.app). Ohne diese Liste
       * bekämen sie 404 wie jeder unbekannte Host.
       *
       * Laufzeit-Override: NUXT_PUBLIC_TENANCY_CONTROL_HOSTS (kommagetrennt) —
       * die Hosts unterscheiden sich je Umgebung (lokal app.localhost).
       */
      controlHosts: [] as string[],
      /**
       * WIZARD-Hosts: die Teilmenge der Kontroll-Hosts, auf denen `/` direkt in
       * den Anlege-Trichter führt (F12). Alle übrigen Kontroll-Hosts zeigen
       * dort die Kunden-Übersicht („Deine Communities").
       *
       * Eigene Achse statt „der erste controlHost ist der Kundenbereich": eine
       * Reihenfolge-Regel kippt beim nächsten Env-Override unbemerkt. Leer =
       * kein Wizard-Host → jeder Kontroll-Host beginnt bei der Übersicht (und
       * die schickt Konten OHNE Community von selbst weiter).
       *
       * Laufzeit-Override: NUXT_PUBLIC_TENANCY_WIZARD_HOSTS (kommagetrennt).
       */
      wizardHosts: [] as string[],
      /**
       * Was auf einem Kontroll-Host überhaupt aufgerufen werden darf (Präfix-
       * Vergleich, fail-closed: alles andere → 404).
       *
       * Der Grund ist kein Aufräumzwang, sondern Datentrennung: auf einem Host
       * OHNE Mandanten würde `scopeQuery` nicht scopen — `/api/comments` liefe
       * dort quer über ALLE Communities des Pool-Projekts. Diese Liste ist
       * die Grenze, die das verhindert; jeder Eintrag ist eine Entscheidung.
       */
      /**
       * `/api/notifications` ist seit C15 dabei — die EINE Entscheidung, die
       * dieser Eintrag verlangt: kontobezogene Meldungen (Zahlung, Anfragen)
       * gehören in den Kundenbereich (Davids Entscheidung 3, 2026-07-29), also
       * muss die Glocke dort ihre Liste holen dürfen. Sicher, weil die Route
       * doppelt eingegrenzt ist: Row-Security gibt nur die Zeilen DES
       * Empfängers heraus, und der Kontroll-Host filtert zusätzlich auf den
       * Kundenbereich-Sentinel (`_account`) plus ungestempelten Bestand — es
       * kann also keine Community-Meldung eines fremden Mandanten kommen.
       * Deckt auch `/api/notifications/read` und `/api/notifications/
       * run-digest` ab (letztere ist system.manage-gated).
       */
      /**
       * `/api/feedback` ist seit E10 dabei (Davids Entscheidung 1). Der
       * Feedback-Bereich ist Bestandteil ALLER Dashboards — auch des
       * Kundenbereichs auf einem Kontroll-Host, wo es keinen Mandanten gibt.
       * Sicher OHNE Mandanten-Scope, weil hier nichts gescopt werden MUSS:
       * die Routen berühren keine Tabelle dieses Projekts, sie reichen an das
       * Control Plane weiter, und DORT entscheidet die Projektion, was ein
       * Betrachter sieht (Text für alle, Herkunft nur für den Betreiber). Die
       * `communityId` im Umschlag ist auf einem Kontroll-Host schlicht leer.
       */
      /**
       * `/api/abuse` ist seit M13 dabei. Das Missbrauchs-Meldeformular muss von
       * einem Host aus erreichbar sein, der NIEMANDEM gehört und deshalb nie
       * gesperrt sein kann — genau das ist ein Kontroll-Host. Sicher ohne
       * Mandanten-Scope aus demselben Grund wie `/api/feedback`: die Route
       * berührt keine Tabelle dieses Projekts, sie reicht mit dem Service-Secret
       * an das Control Plane weiter, und dort landet die Meldung in einer
       * Tabelle ohne jede Client-Berechtigung.
       */
      controlApiPrefixes: ['/api/auth/', '/api/onboarding/', '/api/health', '/api/telemetry/', '/api/notifications', '/api/feedback', '/api/abuse'] as string[],
    },
    /**
     * Realtime-Gate (F14, 2026-08-01) — der EINE Schalter, mit dem eine App
     * ohne lebende Datenebene alle Realtime-Einstiege des Core loswird:
     * Row-Streams (useRealtimeRows → Config-/Branding-Plugin, Kommentare),
     * Presence (usePresence/usePresenceState) und den Account-WS
     * (useRealtimeAccount). AUS heißt: kein Web-SDK nachgeladen, kein Socket,
     * kein `/api/auth/realtime-token`.
     *
     * DIE AUSNAHME VON „Core-Default ist IMMER aus": Realtime ist kein Zusatz,
     * sondern das bestehende Verhalten jeder Produkt-App. Vollständige
     * Begründung + die pure Regel: shared/realtimeGate.ts.
     */
    realtime: {
      enabled: true,
    },
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
