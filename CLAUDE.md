# Maui Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo (maui-monorepo) mit zentralem Core Layer + Feature Layers.
Vollständiges Konzept: docs/CONCEPT.md

## Stack
- Nuxt 4.4.x (Composition API, SSR), Nuxt UI 4.8.x, Pinia, Tailwind CSS 4
- node-appwrite (Server SDK) + appwrite (Web SDK, NUR Realtime) — Appwrite self-hosted 1.9.5
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 22

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Feature Layers (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [features..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)
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
- i18n-Strategie 'prefix_except_default' (en Default/Fallback ohne Prefix unter /...,
  de unter /de/*, detectBrowserLanguage redirectOn: 'all' → jede Seite folgt dem
  i18n_redirected-Cookie, nicht nur '/'): interne Links/Redirects IMMER über
  localePath() — auch in Middleware (useLocalePath()('/...')), sonst geht der
  Locale-Prefix verloren
- createError mit status/statusText (nicht statusCode/statusMessage),
  keine Appwrite-Fehlerdetails an Clients leaken
- useToast kommt aus Nuxt UI — nicht im Core re-exportieren (schattet Auto-Import)
- pnpm, TypeScript strict (kein any), vollständige Dateien, keine Spekulation
- Dependencies via pnpm Catalog: Versionen zentral in pnpm-workspace.yaml,
  package.json referenziert "catalog:" — geteilte Deps auch in App-package.json

## Ports
core/.playground: 3000 · reddit-comments: 3001 · weitere: 3002+

## Git
Conventional Commits · BREAKING CHANGE(core): Prefix · Core-Änderungen
in eigenem Commit · vor Core-Update alle Apps lokal starten
