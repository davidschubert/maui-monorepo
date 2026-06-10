# 🎯 Maui Monorepo – /goal Texte pro Phase

> Ein Goal = eine Phase. Jeder Text folgt dem Schema: **Endzustand → Nachweis → Constraints → Turn-Limit.**
> Der Evaluator sieht nur das Transcript — jede Bedingung muss prüfbaren Terminal-Output erzeugen.
> `/goal` ohne Argument = Status (Turns, Tokens, letzte Evaluator-Begründung).

---

## Phase 1 – Monorepo Setup ✅ (abgeschlossen 2026-06-09)

> ✅ **Erledigt am 2026-06-09.** Root-Tooling (package.json, pnpm-workspace.yaml
> mit Catalog, .npmrc `shamefully-hoist=false`, .nvmrc Node 22, Root tsconfig.json),
> `packages/core` als Nuxt Layer mit `.playground` (Port 3000),
> `apps/reddit-comments` extended Core relativ (Port 3001). Nachweis: `pnpm install`
> fehlerfrei, `nuxi typecheck` grün in Core + App, beide Server gestartet,
> `curl http://localhost:3001` enthält "MAUI-CORE-SMOKE" aus `packages/core`.

```
/goal Phase 1 des maui-monorepo laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: Root-Tooling steht (package.json, pnpm-workspace.yaml inkl.
Catalog, .npmrc mit shamefully-hoist=false, .nvmrc mit Node 22, Root
tsconfig.json), packages/core ist als Nuxt Layer mit .playground
initialisiert, apps/reddit-comments extended den Core via relative Pfade.
Nachweis: `pnpm install` läuft fehlerfrei durch, `nuxi typecheck` ist in
core und app grün, der Core-Playground startet auf Port 3000, die App
startet auf Port 3001 und `curl http://localhost:3001` enthält den Text
"MAUI-CORE-SMOKE" aus einer Komponente, die in packages/core liegt.
Abschluss-Schritt: der Abschnitt "Phase 1" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: keine Appwrite-Integration, kein Auth, keine Module außer
@nuxt/ui, @pinia/nuxt; Versionen ausschließlich über den pnpm Catalog.
Maximal 30 Turns.
```

---

## Phase 2 – Design-Fundament ✅ (abgeschlossen 2026-06-09)

> ✅ **Erledigt am 2026-06-09.** Maui Default Theme in
> `packages/core/app/app.config.ts` (`ui.colors`: primary teal, neutral slate +
> alle semantischen Tokens; Radius via `--ui-radius` in main.css — Nuxt UI 4
> steuert ihn als CSS-Variable, nicht über app.config). main.css mit Tailwind 4
> `@import` + `@source` für den Layer-Pfad. Nachweis: typecheck grün,
> `/theme-check` rendert UButton mit "THEME-CHECK", useAppConfig-Dump zeigt
> Merge App > Core (primary orange aus App, info sky/warning amber aus Core),
> Tailwind-Klassen aus CoreSmoke.vue im gerenderten App-HTML sichtbar.
> Hinweis: app.config.ts muss in Nuxt 4 im `app/`-Verzeichnis liegen
> (srcDir) — im Package-Root wird sie nicht geladen.

```
/goal Phase 2 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: Nuxt UI 4 ist im Core konfiguriert, Maui Default Theme in
packages/core/app.config.ts (primary, neutral, radius), main.css mit
Tailwind 4 @import + @source für den Layer-Pfad, Color Tokens definiert.
Nachweis: `nuxi typecheck` grün; eine Demo-Page /theme-check in der App
rendert einen UButton und `curl http://localhost:3001/theme-check`
enthält "THEME-CHECK"; Override-Test: apps/reddit-comments/app.config.ts
setzt primary auf einen anderen Wert und Claude zeigt per Konsolen-Output
(useAppConfig Dump im Dev-Modus), dass der Merge App > Core greift;
eine Tailwind-Klasse aus einer Core-Komponente wirkt in der App
(im gerenderten HTML via curl sichtbar).
Abschluss-Schritt: der Abschnitt "Phase 2" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: nur ein Default Theme — kein Multi-Theme-System (das ist
packages/themes, später). Maximal 25 Turns.
```

---

## Phase 3 – Appwrite SSR-Fundament ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** node-appwrite ^26.2 + appwrite ^26.0 via Catalog;
> `server/lib/appwrite.ts` mit createAdminClient()/createSessionClient(event)
> (lazy get-Accessors, Client pro Request, Cookie-Name `a_session_<PROJECT_ID>`
> via sessionCookieName()); runtimeConfig-Skeleton (appwriteKey privat,
> public.appwriteEndpoint/ProjectId/DatabaseId leer); server/middleware/auth.ts
> setzt event.context.user (wirft nie, skipt ohne Cookie); shared/types/h3.d.ts
> + appwrite.ts; app/utils/appwrite.client.ts (Web SDK, nur Realtime, Server-Guard);
> useRealtimeRows() mit import.meta.server-Guard + onScopeDispose (subscribe()
> liefert in SDK v26 ein Promise — Cleanup wartet die Auflösung ab);
> .env.example in der App. Nachweis: typecheck grün in Core + App,
> `curl http://localhost:3001/api/health` → `{"ok":true,"user":null}` gegen
> die lokale OrbStack-Instanz (Appwrite 1.9.0, Projekt reddit-comments,
> Datenbank main, Key-Scopes health.read/databases.*/users.*/sessions.write).

```
/goal Phase 3 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: node-appwrite + appwrite (Web) via Catalog installiert;
server/lib/appwrite.ts mit createAdminClient() und
createSessionClient(event) (lazy get-Accessors, Client pro Request);
runtimeConfig-Skeleton (appwriteKey privat, public.appwriteEndpoint/
ProjectId/DatabaseId leer); server/middleware/auth.ts setzt
event.context.user; shared/types/h3.d.ts Augmentation;
app/utils/appwrite.client.ts (Web SDK); useRealtimeRows() mit
import.meta.server-Guard und onScopeDispose; .env.example in der App.
Nachweis: `nuxi typecheck` grün; ein Server-Route /api/health nutzt den
AdminClient gegen die lokale OrbStack-Instanz und `curl
http://localhost:3001/api/health` liefert {"ok":true}; `curl
http://localhost:3001/api/health` ohne Session zeigt user:null im
Response-Body (Middleware greift, wirft aber nicht).
Abschluss-Schritt: der Abschnitt "Phase 3" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: keine Auth-Routes (Phase 4), keine Tables anlegen (Core
besitzt null Tables), API Key nur aus .env, nie in public runtimeConfig.
Voraussetzung: OrbStack-Appwrite läuft lokal — wenn nicht erreichbar,
stoppen und melden statt mocken. Maximal 30 Turns.
```

---

## Phase 4 – Auth ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** Server Routes signup/login/logout/me +
> OAuth-Skeleton (github/google via createOAuth2Token); Session-Cookie
> `a_session_reddit-comments` mit httpOnly+sameSite=strict, secure konditional
> (!import.meta.dev); plugins/auth.server.ts hydratisiert useAuthStore
> (Pinia Composition Style, stores/ via imports.dirs registriert — Layer-stores
> werden nicht auto-gescannt); useCurrentUser(); Zod-Schemas (z.email, v4);
> LoginForm/RegisterForm auf UAuthForm, LogoutButton; Route-Middleware
> auth/guest; pages/login.vue + register.vue. Nachweis als curl-Sequenz gegen
> OrbStack: (1) Signup 200 + Set-Cookie HttpOnly sichtbar, (2) GET /api/auth/me
> mit Cookie → User-JSON mit Test-E-Mail, (3) Logout löscht Cookie (Max-Age=0),
> erneuter GET → 401, (4) /login enthält UAuthForm-Markup (form, email,
> password), (5) typecheck grün in Core + App. Keine profiles Table.

```
/goal Phase 4 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: Server Routes signup/login/logout (+ OAuth-Skeleton),
Session-Cookie a_session_<PROJECT_ID> mit httpOnly+secure+sameSite,
plugins/auth.server.ts hydratisiert useAuthStore, useCurrentUser(),
Zod-Schemas, LoginForm/RegisterForm auf UAuthForm-Basis, LogoutButton,
Route-Middleware auth/guest, pages/login.vue + register.vue im Core.
Nachweis gegen die lokale OrbStack-Instanz als curl-Sequenz im Terminal:
(1) POST /api/auth/signup mit Testdaten → 200 und Set-Cookie-Header mit
HttpOnly sichtbar; (2) GET mit Cookie auf eine geschützte Route →
User-JSON mit der Test-E-Mail; (3) POST /api/auth/logout → Cookie
gelöscht, erneuter GET → 401/redirect; (4) `curl
http://localhost:3001/login` enthält das Login-Formular-Markup;
(5) `nuxi typecheck` grün.
Abschluss-Schritt: der Abschnitt "Phase 4" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: Dev-Umgebung darf secure:false konditional setzen (localhost
hat kein HTTPS), Produktions-Pfad bleibt secure:true; keine profiles
Table — User-Daten via Account prefs. Maximal 35 Turns.
```

---

## Phase 5 – Layouts & User Components ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** layouts/default.vue (Nav data-testid="main-nav"
> + Footer, UserMenu/Login-Button je nach Auth-State) und auth.vue (zentriert,
> kein Nav) im Core; login/register nutzen layout 'auth'; UserAvatar
> (Initialen-Fallback via UAvatar alt, avatarUrl aus prefs), UserMenu
> (UDropdownMenu + Logout), UserProfileForm (name via updateName, bio/avatarUrl
> via updatePrefs — Route PUT /api/auth/profile, SessionClient); typisierte
> MauiUserPrefs in shared/types/appwrite.ts. Fehlerseite: Nuxt löst error.vue
> NICHT aus Layern auf → Markup lebt in CoreErrorPage (Core-Komponente),
> App + Playground haben eine dünne app/error.vue als Wrapper. Nachweis:
> typecheck grün; curl / → Nav-Markup vorhanden, curl /login → kein Nav;
> nicht existente Route mit Accept: text/html → 404 + "MAUI-ERROR"
> (curl-Default Accept */* bekommt Nitros JSON-Error — Browser sind ok).
> Kein dashboard.vue (→ packages/admin).

```
/goal Phase 5 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: layouts/default.vue (Nav + Footer) und auth.vue im Core;
UserAvatar (Initialen-Fallback), UserMenu, UserProfileForm (prefs-basiert);
pages/error.vue.
Nachweis: `nuxi typecheck` grün; `curl http://localhost:3001/login`
zeigt das auth-Layout (kein Nav-Markup); `curl http://localhost:3001`
zeigt das default-Layout (Nav-Markup vorhanden); eine nicht existente
Route liefert die Core-Fehlerseite mit "MAUI-ERROR" Marker.
Abschluss-Schritt: der Abschnitt "Phase 5" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: KEIN dashboard.vue (gehört zu packages/admin, später).
Maximal 20 Turns.
```

---

## Phase 6 – Utilities, SEO & Analytics-Gate ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** useSeo (useSeoMeta + OG/Twitter-Spiegelung),
> usePagination (page/offset/totalPages, Default 25 = Appwrite-Limit),
> useFormatDate/useFormatCurrency (reine Utils in app/utils/format.ts —
> Date-only-Strings werden als LOKALES Datum geparst, sonst Timezone-Kipper),
> useStorage (Upload/View/Delete via Server Routes + SessionClient,
> Buckets gehören der App); useToast kommt aus Nuxt UI selbst (eigener
> Re-Export würde die Auto-Import-Auflösung schatten). maui.*-Defaults in
> Core app.config.ts (analytics+consent enabled:false, provider
> plausible|umami); plugins/analytics.ts UNIVERSAL statt .client, damit der
> Script-Tag bei vorhandenem Consent im SSR-HTML steht (curl-nachweisbar);
> doppeltes Gate: enabled UND (kein Consent-Gate ODER Zustimmung) — sonst
> client-seitiger watch auf hasConsent. CookieBanner (data-marker
> MAUI-CONSENT) + useCookieConsent (Cookie maui-consent) + useAnalytics
> (track, typisierte window-Globals). Nachweis: typecheck grün; curl-Matrix:
> Default → 0× Script/0× Banner; Gates an ohne Cookie → Banner ja, Script
> NEIN (Constraint!); Gates an mit maui-consent=accepted → plausible-Script-
> Tag mit data-domain im SSR-HTML, kein Banner; node-Snippet:
> formatDate('2026-01-01') → 01.01.2026, formatCurrency(1234.56) → 1.234,56 €.
> Demo-Override in der App danach zurückgesetzt (Gates wieder aus).

```
/goal Phase 6 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: useSeo, usePagination, useToast, useFormatDate (dd.MM.yyyy),
useFormatCurrency (1.234,56 €), useStorage; maui.*-Defaults in Core
app.config.ts (analytics/consent enabled:false); analytics.client.ts
Plugin mit Config-Gate; CookieBanner.vue + useCookieConsent.
Nachweis: `nuxi typecheck` grün; Gate-Test als curl-Vergleich:
mit Default (false) enthält `curl http://localhost:3001` weder
plausible- noch umami-Script-Tag und keinen CookieBanner-Marker;
nach Setzen von maui.analytics.enabled:true + consent.enabled:true in
der App enthält derselbe curl den Script-Tag und "MAUI-CONSENT" Marker;
ein kurzes node/vitest-Snippet zeigt formatDate('2026-01-01') →
"01.01.2026" und formatCurrency(1234.56) → "1.234,56 €" im Output.
Abschluss-Schritt: der Abschnitt "Phase 6" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: Analytics-Script lädt NUR nach Consent (Gate im Plugin
prüfen, nicht nur im Banner). Maximal 25 Turns.
```

---

## Phase 7 – i18n ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** @nuxtjs/i18n ^10.4 im Core (de Default,
> strategy prefix_except_default → /en/*, detectBrowserLanguage aus für
> deterministische SSR-Antworten); Core-Locales in i18n/locales/{de,en}.json
> (auth.*, validation.*, ui.* inkl. Consent); Zod-Schemas als Factories
> create*Schema(t) — Komponenten übersetzen via computed(() =>
> createLoginSchema(t)), Server validiert mit der Key-Variante;
> Auth-Formulare, LogoutButton, UserMenu, CookieBanner, Nav auf t() umgestellt.
> App ergänzt eigene Keys (app.tagline) via i18n/locales + gleiche
> locale-codes in nuxt.config — Merge mit Core-Locales funktioniert.
> Stolperfalle: '@' in Messages ist vue-i18n-Linked-Syntax → E-Mail-
> Placeholder brauchen {'@'}-Escape, sonst bricht der GANZE Locale-Load
> ("Invalid linked format"). Nachweis: typecheck grün; curl /login →
> deutsche Core-Strings, /en/login → englische; / und /en → App-Key
> (Tagline) neben Core-Key (Nav-Button), beide lokalisiert.

```
/goal Phase 7 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: @nuxtjs/i18n im Core konfiguriert (de Default, en sekundär),
i18n/de.json + en.json mit Shared Strings (Auth, Validierung, UI),
Auth-Formulare und Zod-Fehlermeldungen nutzen i18n keys.
Nachweis: `nuxi typecheck` grün; `curl http://localhost:3001/login`
enthält einen deutschen String aus der Core de.json; `curl
http://localhost:3001/en/login` (bzw. via Locale-Mechanismus) enthält
das englische Pendant; die App ergänzt einen eigenen Key und er
erscheint im curl-Output neben den Core-Keys.
Abschluss-Schritt: der Abschnitt "Phase 7" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: Layer bleibt lokal im Monorepo (Remote-Layer-i18n-Bug).
Maximal 20 Turns.
```

---

## Phase 8 – Testing ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** Vitest ^4.1.8 via Catalog im Core
> (vitest.config.ts, tests/ am Layer-Root, explizite vitest-Imports statt
> globals — hält die Playground-tsconfig sauber). 20 Tests in 2 Dateien,
> alle grün via `pnpm --filter @maui/core test`: formatDate (Date-only-
> Strings, Monatswechsel timezone-sicher, Date-Objekte, Timestamps,
> Locales), formatCurrency (1.234,56 €, 0-Beträge, negative Beträge,
> Rundung, Fremdwährung — Intl-NBSP via normalize() behandelt),
> usePagination (Defaults, totalPages-Aufrundung, leere Page, next/prev-
> Klemmung, setPage-Clamp, offset, reaktives total). Dafür nutzt
> usePagination jetzt explizite Vue-Imports statt Nuxt-Auto-Imports —
> ohne Nuxt-Context testbar. `nuxi typecheck` grün in Core + App.
> Keine Component-Tests, kein E2E (Constraint).

```
/goal Phase 8 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: Vitest im Core eingerichtet; Unit Tests für useFormatDate,
useFormatCurrency und usePagination (inkl. Edge Cases: Monatswechsel,
0-Beträge, negative Beträge, leere Page).
Nachweis: `pnpm --filter @maui/core test` läuft grün durch mit
mindestens 12 Tests, Output im Terminal sichtbar; `nuxi typecheck` grün.
Abschluss-Schritt: der Abschnitt "Phase 8" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: keine Component-Tests (Layer-Testing fehleranfällig),
kein E2E (kommt später pro App). Maximal 15 Turns.
```

---

## Phase 9 – CI / Deployment ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** typecheck.yml, lint.yml, test.yml — jeweils
> actions/checkout + pnpm/action-setup (liest packageManager) +
> actions/setup-node mit node-version-file: .nvmrc und pnpm-Cache,
> `pnpm install --frozen-lockfile`, dann `pnpm -r <script>` (Workspace-
> rekursiv, Packages ohne Script werden übersprungen). Lint-Setup neu:
> @nuxt/eslint-config (flat) als EINE Root-Config — auch im Root-
> package.json als devDep nötig (Config-Imports lösen vom Config-Ort auf);
> vue/multi-word-component-names für Nuxt-Konventionsdateien in
> Layer-Pfaden (app/pages, app/layouts, error.vue) deaktiviert, da die
> Default-Ausnahmen der Nuxt-Config dort nicht greifen. deploy.yml nur
> als dokumentiertes Skeleton (workflow_dispatch + auskommentierter
> ploi.io-Webhook-Job, kein Secret im Repo). Nachweis: pnpm -r typecheck/
> lint/test lokal grün (20 Tests); nach Push zeigt gh run list alle drei
> Workflows completed/success (Test 26s, Lint 29s, Typecheck 1m2s).

```
/goal Phase 9 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: .github/workflows/typecheck.yml, lint.yml und test.yml
(jeweils mit node-version-file: .nvmrc, pnpm Setup, Workspace-Filter);
Repo auf GitHub gepusht.
Nachweis: lokal laufen exakt die CI-Kommandos grün durch (`pnpm -r
typecheck`, `pnpm -r lint`, `pnpm -r test`); nach dem Push zeigt
`gh run watch` (oder `gh run list`) alle Workflows als completed/success
im Terminal-Output.
Abschluss-Schritt: der Abschnitt "Phase 9" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: deploy.yml nur als dokumentiertes Skeleton anlegen
(ploi.io-Webhook wird manuell konfiguriert, kein Secret im Repo).
Maximal 20 Turns.
```

---

## Phase 10 – packages/comments Feature Layer ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** packages/comments als eigenständiger Layer:
> shared/types/comment.ts (Comment + CommentVote extends Models.Row, status-
> Feld als Moderations-Hook für packages/admin), Zod-Schemas als Factories,
> Server Routes GET/POST /api/comments (Query.limit 25 + Offset-Pagination,
> nur status=visible, Row-Permissions Autor-only für update/delete) und
> POST /api/comments/:id/vote (Upsert, Unique-Index commentId+userId),
> Components CommentThread/CommentForm/VoteButtons, Migration
> 001-comments-tables.ts (idempotent, via node --env-file gegen die
> App-Instanz — Key brauchte zusätzlich tables/columns/indexes read+write).
> App komponiert extends: [comments, core]. createSessionClient & Co. kommen
> via Core server/utils-Re-Export (Nitro Auto-Import über Layer hinweg).
> WICHTIGE ERKENNTNIS: Das Realtime-Protokoll der SDKs ≥25.x (Connect ohne
> Channels + dynamische Subscribes) braucht Appwrite ≥1.9.5 — das es
> self-hosted NICHT gibt (1.9.0 = aktuellstes Release, Cloud-first wie
> Presences; Server antwortet "Missing channels", Query-Subscriptions via
> URL ignoriert der Server ebenfalls). useRealtimeRows läuft deshalb auf
> nativem WebSocket mit Legacy-URL-Protokoll + client-seitigem where-Filter
> (postId) — Same-Origin-Cookie hält die A3-Auth-Story intakt; Rückbau aufs
> SDK sobald self-hosted nachzieht. Nachweis: Migration loggt alle Tables/
> Columns/Indexes; curl: POST → 201 + Row-JSON, GET ?postId → Liste mit
> Kommentar, Vote-Upsert (gleiche Row, value 1→-1); Realtime-Probe (Node)
> loggt das create-Event mit vollem Payload nach zweitem POST;
> pnpm -r typecheck + lint grün über alle Packages.

```
/goal Phase 10 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: packages/comments als eigenständiger Nuxt Layer mit
shared/types/comment.ts (extends Models.Row), Server Routes
(GET/POST /api/comments mit Zod-Validierung, Query.limit, Pagination),
Components (CommentThread, CommentForm, VoteButtons),
Realtime-Anbindung via useRealtimeRows<Comment> mit Query-Filter auf
postId, Migration-Script scripts/migrations/001-comments-tables.ts;
apps/reddit-comments komponiert extends: [comments, core].
Nachweis gegen die lokale OrbStack-Instanz: Migration-Script läuft durch
und loggt die angelegten Tables; curl-Sequenz: POST /api/comments mit
Session-Cookie → 201 mit Row-JSON, GET /api/comments?postId=… → Liste
enthält den Kommentar; ein node-Script subscribed auf den
Realtime-Channel und loggt das create-Event nachdem ein zweiter POST
abgesetzt wurde (Event-Payload im Terminal sichtbar);
`nuxi typecheck` über alle Packages grün.
Abschluss-Schritt: der Abschnitt "Phase 10" in docs/GOALS.md ist mit ✅
und Datum markiert — Teil des Nachweises.
Constraints: Tables gehören zur App-Instanz, nicht zum Core; Voting nur
als Datenmodell + Route, UI-Feinschliff kommt in Phase 11.
Maximal 40 Turns.
```

---

## Phase 11 – Reddit Comment System App

> Entwurf vom 2026-06-10 (aus CONCEPT.md Phase 11 + Stand nach Phase 10 —
> die [[reddit-comment-system-setup]] Notiz war nicht auffindbar; bei
> Bedarf vor dem Setzen anpassen). Presence bleibt außen vor, bis
> self-hosted es kann (Release-Watch läuft wöchentlich).

```
/goal Phase 11 laut docs/CONCEPT.md ist abgeschlossen.
Endzustand: apps/reddit-comments ist ein nutzbares Kommentarsystem:
Page /p/[postId] rendert den CommentThread; Threading mit Antworten
auf Kommentare (verschachtelt bis Tiefe 3, Antworten-Button pro
Kommentar); Sortierung new (Default) und top als sort-Query-Param der
GET-Route — top sortiert nach Vote-Score; die GET-Route liefert pro
Kommentar ein score-Feld (Aggregation über comment_votes in EINEM
zusätzlichen Query, kein N+1) und myVote für den eingeloggten User;
VoteButtons zeigen Score + eigenen Vote-Zustand, Optimistic Update mit
Rollback bei Fehler; neuer Kommentar erscheint optimistisch sofort;
Realtime fügt fremde Kommentare gezielt ein (kein Full-Refresh);
comments-Layer-Strings als i18n keys (de+en); UserAvatar + formatDate
in der Kommentar-Darstellung; Empty-/Loading-States.
Nachweis: pnpm -r typecheck, lint und test grün; curl-Sequenz gegen
die lokale Instanz: zwei Kommentare mit unterschiedlich vielen Votes
anlegen, dann zeigt GET /api/comments?postId=…&sort=top die
Score-Reihenfolge und sort=new die Datums-Reihenfolge im Terminal;
GET-Response enthält score und myVote; POST mit parentId → curl
http://localhost:3001/p/demo-post zeigt den verschachtelten Kommentar
im SSR-HTML (Einrückungs-Markup sichtbar); curl /en/p/demo-post zeigt
englische Layer-Strings; für Optimistic Updates zeigt Claude den
Code-Pfad (Anlegen → sofortiges Einfügen → Rollback im catch).
Abschluss-Schritt: der Abschnitt "Phase 11" in docs/GOALS.md ist mit ✅
und Datum markiert, README-Status aktualisiert — Teil des Nachweises.
Constraints: kein Presence (Cloud-only), keine Moderations-UI (gehört
zu packages/admin), Schema-Änderungen NUR via neuem Migration-Script
im comments-Layer, Realtime bleibt auf dem nativen WebSocket-Client.
Maximal 40 Turns.
```

---

## Tipps

- **Ein Goal pro Phase, nicht alles auf einmal** — kleinere, verifizierbare Einheiten = weniger Evaluator-Fehlschlüsse, weniger Token-Verschwendung.
- Wenn ein Goal hängt: `/goal pause`, Zwischenstand anschauen, Bedingung präzisieren, neu setzen.
- Vor jedem neuen Goal: kurzer Blick auf `git log` — Fable committed unterwegs; saubere Conventional Commits sind in der CLAUDE.md verankert.
- Marker-Strings ("MAUI-CORE-SMOKE" etc.) nach bestandener Phase wieder entfernen lassen — oder als dauerhafte Smoke-Tests in Vitest überführen.
