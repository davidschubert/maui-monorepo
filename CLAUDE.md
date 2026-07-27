# Maui Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo (maui-monorepo) mit zentralem Core Layer + Feature Layers.
Vollständiges Konzept: docs/CONCEPT.md

## Stack
- Nuxt 4.4.x (Composition API, SSR), Nuxt UI 4.8.x, Pinia, Tailwind CSS 4
- node-appwrite (Server SDK) + appwrite (Web SDK, NUR Realtime) — Appwrite self-hosted 1.9.6
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 22

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Feature Layers (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [features..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)
- Feature-Manifeste (Plattform-Strategie F1): JEDER Layer hat
  feature.manifest.ts (key/tier/requires/Katalog-Texte, nur `import type`!),
  JEDE App site.manifest.ts = Single Source der Feature-Wahl.
  `pnpm check:manifests` (CI/lint) erzwingt Konsistenz mit extends +
  package.json + migrate.mjs-LAYER_ORDER — neue Layer/Apps immer mit
  Manifest anlegen. Strategie: docs/plans/MULTI-SITE-PLATFORM-STRATEGIE.md
- Layer-Grenzen-Matrix (wer darf was besitzen) + Durchsetzung: CONCEPT.md A14.
  Neue Cross-Layer-Abhängigkeiten als EXPLIZITE Verträge (kein impliziter
  Auto-Import/String-Coupling); ESLint no-restricted-imports als Backstop.
  Fundament-Layer (core, geplant: moderation/system) hängen NIE von Features ab.

## Appwrite (SSR-first, TablesDB)
- Terminologie: TablesDB / Tables / Rows (NICHT Databases/Collections/Documents)
- Zwei Server-Clients: createAdminClient (API Key) + createSessionClient
  (pro Request, NIE teilen!) in server/lib/appwrite.ts; Feature Layer nutzen
  sie via Auto-Import (Core re-exportiert in server/utils/appwrite.ts)
- Zwei Keys pro Instanz: Runtime-Key (sessions/users/rows/health, in .env) +
  Migrations-Key (databases/tables/columns/indexes, nur für Scripts)
- CRUD NUR über server/api/* (Session enforced, Validierung zentral),
  NIE Web SDK CRUD aus <script setup>
- Realtime (seit P1, 2026-07-01): EINE geteilte, JWT-authentifizierte SDK-
  Realtime in core/app/composables/useRealtimeClient.ts (sharedRealtime,
  realtimeCookieClient, ensureRealtimeJwt) — useRealtimeRows, Presence und
  Config-Flags multiplexen über denselben Socket (Channel.tablesdb().table()
  .row(), optional server-seitige queries; where-Filter bleibt Sicherheitsnetz).
  JWT via GET /api/auth/realtime-token (15 min, Client refresht; Cookie-Client
  NIE mit JWT mischen → Appwrite-403). AUSNAHME: useRealtimeAccount bleibt
  bewusst cookie-nativer WS (Instant-Session-Revoke hängt am Cookie-Close) —
  NICHT konsolidieren. Realtime braucht einen gesunden appwrite-realtime-
  Container (Swoole-Crash → `docker compose up -d --no-deps appwrite-realtime`).
- Session-Cookie: a_session_<PROJECT_ID>, httpOnly+secure+sameSite,
  Appwrite-Endpoint als Subdomain derselben Root-Domain
- Jede App: EIGENE Appwrite-Instanz, Config aus .env
  (NUXT_APPWRITE_KEY server-only, NUXT_PUBLIC_* für Endpoint/Project)
- Immer explizites Query.limit() (Default 25)
- SDK-Generics nutzen: tablesDB.listRows<T>()
- Migrations: idempotent (409 → skip), IMMER über den zentralen Runner
  `pnpm migrate --app <app>` (scripts/migrate.mjs; bei mehreren Apps ist
  --app Pflicht — nie die falsche Instanz), nach Column-Anlage auf
  'available' pollen bevor Indizes
- Presences API (self-hostbar seit 1.9.5): GESAMTE Presence vereinheitlicht auf
  EINE Presence pro User (presenceId=userId; metadata trägt scope/action/typing).
  WICHTIG (SSR-Cookie-Architektur): der Browser kann seine Presence NICHT selbst
  schreiben — der Web-SDK-Client hat keine Session, daher wird realtime.
  upsertPresence() über einen Guest-WS verworfen und PUT /presences → 401. Der
  WRITE läuft daher server-seitig: POST /api/presence/heartbeat upsertet mit dem
  Admin-Client (read("users"), expiresAt 90s). usePresenceState() = einzige
  Heartbeat-Autorität pro Tab (ruft die Route bei Login/metadata-Änderung + alle
  20s + bei visibilitychange/focus). usePresence(predicate) = Reader — liest
  direkt über die Presences-API (presences.list() per Cookie-GET funktioniert +
  Channel.presences()-Trigger), „online jetzt" via updatedAt-Recency 60s. Server:
  listOnlinePresences() in core/server/utils/presence.ts. KEINE presence-Table mehr.
  metadata-Felder (je eigener Zweck, kollidieren nicht): scope (Thread), action
  (reviewing:/editing:), typing, page (Dashboard-Seite), replyingTo (commentId),
  near (commentId, Lese-Position). Use-Cases: useThreadPresence (scope + typing +
  replyingTo + near), useModerationPresence (action reviewing:*), useEditAwareness
  (action editing:*), useViewingPresence (page → DashboardViewers „N sehen diese
  Seite"). PresenceAvatar (core): Avatar + Icon-Badge in der Ecke (tippt/antwortet)

## Themes (Layer themes; Tables besitzt system, Admin-Routen admin — A14)
- Built-in-Katalog 26×11 (seit 2026-07-24): theme.catalog.ts ist der EINZIGE
  Input — `pnpm --filter @maui/themes generate -- --write` erzeugt
  public/themes/*.css + themeRegistry.gen.ts (committet; CI-Gate
  `check:themes` in lint.yml: Regenerieren darf kein Diff erzeugen). Ramps
  ankern die Basisfarbe fest auf Stufe 500; Kontrast-Gate verschiebt
  --ui-primary-Stufen selbst. Öffentlicher Picker = ThemePickerModal
  (Grid + sticky Varianten-Reihe), NIE CSS/Registry von Hand editieren.
- Theme-Studio: /dashboard/themes (Galerie, Zweispalten), Editor als Vollseite
  (/new, /:id — Dock: Boxen „Farben"+„Schriften", je EIN „Erweitert"),
  Schriften-Verwaltung /dashboard/themes/fonts. Konzept + bewusste
  Ablehnungen: docs/THEMES-CONCEPT-V2.md — Einfachheit ist Leitprinzip
  (Standardansicht = wenige Entscheidungen, kein Slot-/Regler-Zoo)
- Custom Themes: Table custom_themes (system-Migrationen 009–013), Ramp zur
  Laufzeit aus EINER Basisfarbe (themes/shared/ramp.ts, OKLCH + Tests).
  config-JSON NUR ADDITIV erweitern (kein version-Feld): neutral 'tinted',
  font/fontHeading, darkAlias, headingWeight/Tracking/Uppercase, radius
- <html>-Attribute (SSR-Head via theme-Plugin, flash-frei; Draft-Vorschau
  im Editor setzt sie direkt und stellt beim Verlassen den LIVE-Zustand aus
  useTheme() wieder her): data-theme ('c-<rowId>'), data-variant,
  data-neutral, data-font, data-font-heading
- Schriften, 2 Rollen (Text + Überschriften, + fixe Mono — nie mehr als 3):
  Registry-Einzelfamilien in app/assets/css/fonts.css (build-prozessiert →
  @nuxt/fonts self-hostet; NIE nach public/) + WOFF2-Uploads (Bucket 'fonts',
  Magic-Bytes-Check, 'cf-<rowId>', @font-face zur Laufzeit im Head).
  Legacy-Paar-Ids (editorial …) mappt resolveThemeFonts()
- Live-Propagation: custom_themes/custom_fonts/app_config sind Table-read(any)
  → realtime-themes-Plugin refetcht debounct, Head reagiert — offene Fenster
  (auch Gäste) morphen ohne Reload
- Injizierte Theme-Styles sind unlayered und schlagen Tailwind-@layer-
  Utilities BEWUSST (z. B. headingWeight vs. font-bold)
- Admin-Nav-Registry (maui.admin.modules) kann children (Unterpunkte,
  RBAC-gefiltert, exact für Index-Einträge)

## Hosts (Umbenennung 2026-07-25, Cutover 2026-07-26 — Davids Entscheidung)
- `control.pukalani.app` = Betreiber-Oberfläche, seit dem Cutover VOLLSTÄNDIG:
  eigene ploi-Site 392163 (nginx → Port 3003, eigenes LE-Zertifikat für
  control+studio), Release-Slot `releases/control`, Appwrite-Projekt
  `control` (Session-Cookie a_session_control). `studio.pukalani.app` ist
  nur noch ALIAS dieser Site — der Stripe-Webhook zeigt weiter auf ihn
  (bei Stripe-Live auf control umstellen, dann kann der Alias weg).
  Die control-Site hat BEWUSST kein Repository: die CI rsynct .output UND
  ops/-Configs; ploi-Fallback-Deploy gibt es für control nicht (Fallback =
  Runbook docs/plans/CONTROL-CUTOVER.md).
- `my.pukalani.app` = Kundenbereich, `start.pukalani.app` = Kurz-Link in den
  Wizard, `app.pukalani.app` = Altname, bleibt vorerst. ALLE DREI sind
  Kontroll-Hosts derselben Platform-App und brauchen weder DNS noch eigene
  Site (Wildcard `*.pukalani.app` zeigt schon dorthin).
- TLS-Falle: Port 80 antwortet nur für explizit konfigurierte Hosts, also
  scheitert die HTTP-Prüfung von Let's Encrypt für Aliase. Lösung ist das
  Wildcard-Zertifikat per DNS-Prüfung (Cloudflare) — so auf der Control-Site
  gemacht.
- Neue Namen IMMER in RESERVED_SUBDOMAINS (packages/control/schemas/tenant.ts),
  sonst kann ein Selbstbedienungs-Kunde sie beantragen.

## Self-Service-Onboarding (Layer onboarding, seit 2026-07-25)
- Trichter auf den Kontroll-Hosts der Platform-App: bewusst KEIN Mandant
  (`maui.tenancy.controlHosts`, Env-Override
  NUXT_PUBLIC_TENANCY_CONTROL_HOSTS). Weil dort NICHTS gescopt ist, lässt
  `01.control-center.ts` nur `maui.tenancy.controlApiPrefixes` zu — alles
  andere 404. Neuer Endpunkt im Kundenbereich ⇒ Präfix bewusst eintragen.
- Einladungs-Link: `start.pukalani.app?code=…` → Auth-Guard hängt das Ziel als
  `?redirect=` an (safeRedirectTarget, core/shared — NUR Pfade auf diesem
  Host), nach der Anmeldung geht es zurück, der Wizard liest `?code=` und
  prüft ohne Klick. Post-Auth-Ziel IMMER über useAuthRedirect().
- Anlegen gehört dem Control Plane: `POST /api/control/onboarding/site` verlangt
  Service-Secret (NUXT_CONTROL_ONBOARDING_SECRET ⇔ NUXT_ONBOARDING_SERVICE_SECRET)
  UND ein Appwrite-JWT, das das Control Plane SELBST gegen das Pool-Projekt
  prüft. Idempotenz über den Hostnamen (kein Idempotency-Key); Owner-Mitgliedschaft
  scheitert ⇒ Tenant wird zurückgerollt.
- Vertrag (Kataloge, 6 Vibes, Testphase, Kontingent):
  `packages/control/shared/onboarding.ts` — der Wizard-Layer konsumiert ihn.
- Branding gehört dem MANDANTEN (`tenants.theme/variant`), nicht dem Projekt:
  `app_config.themeSettings` ist EINE Row pro Projekt.
- Site-Routen autorisieren über `requireSitePermission` (Site-Rolle, dann
  protokollierter Operator-Break-Glass) — NIE `requirePermission` erweitern:
  die ist synchron und wird ohne await gerufen.
- Beweise: `packages/onboarding/scripts/{verify-control-host,verify-site-authz,
  acceptance-onboarding}.mjs` + `packages/control/scripts/verify-onboarding.mjs`.
  Lokal testen: `seed-local-tester.mjs` (Konto+Code, `--clean` räumt auf).
  Node's `fetch` verwirft einen eigenen Host-Header, und Nitro hört auf `[::1]`
  (Vites HMR-Server auf IPv4) — die Skripte nutzen deshalb node:http über ::1.

## KI, E-Mail, Embed, Moderation (Core-Bausteine seit 2026-07-09/10)
- KI: aiComplete()/aiCompleteJson() (core/server/utils/aiComplete.ts) = EIN
  Transport für OpenAI-kompatible APIs (Default OpenRouter). Gate maui.ai
  (enabled/model/baseUrl, Core-Default aus) + server-only NUXT_AI_KEY;
  Transport ist policy-frei — Gates + Antwort-Klemmung beim Konsumenten.
  Laufzeit-Override-Kette: app_config.ticketsAiModel > app_config.aiModel
  (system-016, Admin-Config-Seite, getEffectiveAiConfig) > maui.tickets.ai >
  maui.ai. Konsumenten: Ticket-Triage, Moderations-Assist (Kommentare
  /api/admin/comments/:id/assist + Posts /api/posts/:id/assist — advisory,
  Mensch entscheidet; UI-Flag isAiAvailable()).
- E-Mail: sendMail() (core mailer.ts, nodemailer, NUXT_SMTP_* — leerer Host =
  aus, lokal Mailpit localhost:1025). notify() hat einen Opt-in-E-Mail-Zweig:
  prefs.emailNotifications off|instant|digest (Default off, Settings →
  Benachrichtigungen; Mail-Sprache = prefs.emailLocale). Digest-Sweep:
  Kandidaten aus UNGELESENEN notifications-Rows (kein User-Scan), max 1
  Mail/Tag (prefs.emailDigestLastAt, merge!), Intervall-Plugin 30 min +
  POST /api/notifications/run-digest (system.manage).
- Embed (Read-only-MVP, docs/EMBED.md): Gate maui.comments.embed
  (enabled/allowedOrigins, Default aus) → /embed-Seite + public/embed.js.
  frame-ancestors via core-Registry registerEmbeddableRoute (Default 'self'
  auf ALLEN SSR-Seiten); csrf-origin.ts-Middleware (maui.security.
  csrfOriginCheck) wird PFLICHT, sobald E2-Partitioned-Cookies kommen.
  Transparenter Hintergrund NUR bei theme=auto. localhost:PORT↔PORT ist
  same-SITE — echtes Cross-Site-Gastverhalten braucht echte Domains.
- Moderation: Zweiphasen-Hide + Cascade gehören dem comments-Layer
  (commentModeration.ts) — admin-Routen + Auto-Hide teilen sie. Eskalation:
  registerReportEscalationHandler (moderation zählt, Owner reagiert);
  comments blendet ab maui.comments.autoHideReports offenen Meldungen aus
  (0 = aus; Meldungen bleiben offen). resolveReportsForTarget/
  openReportsForTarget sind die moderation-Verträge für Resolve/Assist/Bulk.
- Microcache: createMicrocache() (core) NUR für user-agnostische GETs —
  Gast-Kommentare Seite 1 (10s), öffentlicher Changelog (Write-invalidiert),
  App-/api/stats (60s). NIE Antworten mit Session-Daten cachen; kein
  SSR-Seiten-SWR (Session-State steckt im HTML).

## Config-Gates (app.config.ts, Namespace maui.*)
- maui.analytics / maui.consent: Core-Default false, App aktiviert explizit
- maui.observability: strukturierte JSON-5xx-Logs am zentralen server/error.ts
  + Client-Error-Inbox (POST /api/telemetry/error, rate-limited); Core-Default
  aus, Sentry-Andockpunkt in core/server/utils/logEvent.ts
- maui.auth.*: providers (OAuth-Buttons), termsUrl (AGB-Pflicht), otp
- maui.admin.modules: Modul-Registry der Dashboard-Nav — Feature-Layer
  registrieren ihre Admin-Seiten hier (expliziter Vertrag statt Kopplung)
- GDPR: registerUserDataContributor (core/server/utils/userData.ts) — Feature-
  Layer registrieren Export/Löschung ihrer User-Daten per Nitro-Plugin
  (server/plugins/user-data.ts); core orchestriert (deleteUserCompletely:
  Snapshot → Sperren → Contributors → users.delete nur bei Voll-Erfolg).
  Neue Layer mit User-Daten MÜSSEN einen Contributor registrieren.
- app.config.ts wird tief gemergt — App überschreibt nur was nötig

## Pläne & Produkte (P4-Rename 2026-07-26, Davids Pricing-Entscheid)
- Pool-Pläne heißen **basic / personal / pro** (vorher free/pro/business —
  normalizeTenantPlan() mappt Altwerte; Daten sind migriert). Enterprise ist
  KEIN Plan-Key: das ist das Silo-/Pukalani-Studio-Angebot. Preise: Personal
  29 €, Pro 149 €, jährlich −25 % (scripts/stripe/ensure-prices.mjs — zieht
  lookup_keys bei Betragsänderung auf neue Prices um).
- Kundensprache: „**Produkte**" statt Features/Bausteine (Landing, UI,
  Pricing). Im CODE bleibt das Vokabular `features` (Manifeste, Gates).
- Produkt-Gating im Pool: maui.tenancy.products (Produkt-Key → Mindest-Plan,
  Plan-Ordnung = Reihenfolge der quota.plans-Keys) + requirePlanProduct(event,
  key) an den API-Einstiegen (posts = personal, ai = pro; 404 wie Datentür).
  UI-Sichtbarkeit via useTenantPlan().planAllows(); Demo-Hosts zeigen
  PlatformPlanBadge („Ab Personal/Pro") an den Produkten.

## Mandanten-Isolation: EINE Datentür (seit 2026-07-26)
- In `server/api/**` mandantenfähiger Layer geht Datenzugriff über
  `tenantDb(event)` (core/server/utils/tenantDb.ts) — NICHT über
  `createAdminClient().tablesDB` / `createSessionClient().tablesDB` direkt.
  `list/find/count` scopen immer, `get/update/remove` belegen die Zugehörigkeit
  VOR der Aktion, `create` stempelt tenantId + Row-Permissions. `as:'operator'`
  = Admin-Client (Moderation) — dort ist die Tür die EINZIGE Grenze, weil der
  Admin-Client die Row-Permissions bewusst umgeht.
- Warum: Isolation hing an drei Dingen, an die man sich erinnern musste
  (scopeQuery/scopeRow/ID-Prüfung). Am 2026-07-26 hat genau das versagt (drei
  Moderations-Routen lasen fremde Zeilen per ID, commit 1cc4855).
- AUSSERHALB der Tür erlaubt (per Definition mandantenübergreifend):
  Migrationen, Sweeps/Intervall-Plugins, GDPR-Orchestrierung, Control Plane.
- `tenantId` kommt NIE vom Aufrufer (stripTenantKey) — sonst schreibt ein
  durchgereichter Body in einen fremden Mandanten.
- BACKSTOP (seit 2026-07-27): ESLint verbietet rohes `.tablesDB` in
  `server/api/**` der gepoolten Layer (comments, posts, pages, moderation —
  eslint.config.mjs, no-restricted-syntax). Neue Pool-Layer in die Liste
  aufnehmen, sobald ihre Tabellen tenantId tragen. Pool-Unique-Regel gilt
  weiter: Unique-Indizes brauchen tenantId (z. B. comments-015 uq_tenant_host).

## Coding Rules
- <script setup lang="ts">, Nuxt UI Komponenten bevorzugen. Auth-Formulare:
  UAuthForm ist die VORLAGE (Optik/Struktur) — Login/Register/OTP sind bewusst
  eigene UForm-Implementierungen (2-Schritt-OTP, Security-Phrase, geteilter
  E-Mail-State, AGB-Gate); Details in docs/AUTH-FORMS.md
- Pinia defineStore Composition Style; Layer-stores via imports.dirs registrieren
  (werden nicht auto-gescannt)
- Relative Pfade im Layer (kein ~/ oder @/)
- app.config.ts liegt in app/ — im Package-Root wird sie stillschweigend ignoriert
- error.vue wird nicht aus Layern aufgelöst: Markup in CoreErrorPage,
  jede App hat eine dünne app/error.vue als Wrapper
- Domain-Types in shared/types/ (nie app/types/ — Server sieht sie sonst nicht)
- Zod für alle Formulare (Schemas als create*Schema(t)-Factories),
  i18n keys für User-facing Strings (keine hartcodierten Strings im Markup/Toasts);
  '@' in Locale-Messages als {'@'} escapen
- i18n-Strategie 'prefix_except_default' (en Default ohne Prefix unter /...,
  de unter /de/*, detectBrowserLanguage redirectOn: 'all' → jede Seite folgt dem
  i18n_redirected-Cookie, nicht nur '/'; BEWUSST ohne fallbackLocale — signal-
  lose Requests wie Crawler behalten die URL-Locale, sonst EN-Content unter
  /de/*): interne Links/Redirects IMMER über localePath() — auch in Middleware
  (useLocalePath()('/...')), sonst geht der Locale-Prefix verloren. SEO:
  useLocaleHead in den App-app.vue liefert hreflang/canonical/og:locale;
  absolute URLs via NUXT_PUBLIC_I18N_BASE_URL (i18n.baseUrl-Skeleton in core)
- createError mit status/statusText (nicht statusCode/statusMessage),
  keine Appwrite-Fehlerdetails an Clients leaken
- useToast kommt aus Nuxt UI — nicht im Core re-exportieren (schattet Auto-Import)
- pnpm, TypeScript strict (kein any), vollständige Dateien, keine Spekulation
- Dependencies via pnpm Catalog: Versionen zentral in pnpm-workspace.yaml,
  package.json referenziert "catalog:" — geteilte Deps auch in App-package.json

## Ports
core/.playground: 3000 · comments: 3001 · weitere: 3002+ ·
Docs-Site: 4000 (docs/, `pnpm dev:docs` — eigenständige Nuxt-Content-App,
KEIN Layer/keine apps/*-App, Inhalte in docs/content/)

## Tests
pnpm -r test (Unit) · Playwright-E2E in apps/comments (Base-URL per
PW_BASE_URL überschreibbar — parallele Dev-Sessions) · themes-visual zielt
auf die deterministische /visual-Seite (NIE Live-Daten screenshotten) ·
CI e2e.yml fährt eine echte Wegwerf-Appwrite (ci/appwrite +
scripts/ci/appwrite-setup.mjs → bootstrap --seed → volle Suite inkl. Realtime)

## Git
Conventional Commits · BREAKING CHANGE(core): Prefix · Core-Änderungen
in eigenem Commit · vor Core-Update alle Apps lokal starten
