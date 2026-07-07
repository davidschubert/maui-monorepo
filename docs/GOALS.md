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

## Phase 11 – Reddit Comment System App ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** Migration 002 (drop+create): comments mit
> targetId/targetType, content (10k), upvotes/downvotes/score (denormalisiert),
> status active/reported/hidden/deleted; Indizes target/parent/score/status.
> Routes: GET mit sort=top|new|controversial (controversial je Seite berechnet)
> + myVotes aus EINEM votes-Query; POST/PATCH/DELETE (Soft-Delete);
> Vote-Toggle mit atomaren Zähler-Increments via AdminClient
> (incrementRowColumn/decrementRowColumn, score konsistent nachgezogen);
> Report via AdminClient (nur active → reported). useCommentStore (rows,
> userVotes, sortMode, threaded-Baum-Getter, applyRealtime) — Optimistic
> Updates: addComment fügt temp-Row ein und ersetzt/entfernt sie im
> then/catch, vote snapshottet Row+Vote, rechnet Zähler lokal und
> reconciled/rollbackt mit der Server-Antwort. Komponenten CommentSection
> (Sortierauswahl, Realtime-where auf Target), CommentThread (rekursiv,
> unbegrenzte Tiefe), CommentItem (Avatar via gelockertem AvatarUser-Typ,
> Antworten/Bearbeiten/Löschen/Melden, [gelöscht]-Platzhalter), CommentForm,
> VoteButtons. i18n de+en als dritter Locale-Merge-Layer (comments zwischen
> App und Core). Nachweis (2 User, User B via Signup): sort=top zeigt
> score 2 vor 0 mit allen Zähler-Feldern + myVotes-Map; sort=new
> Datums-Reihenfolge; sort=controversial polarisierten Kommentar (2.0)
> zuerst; Toggle: erneutes +1 → myVote null, up 2→1; Antwort mit parentId
> erscheint im SSR-HTML INNERHALB data-thread-children; DELETE → status
> deleted, bleibt gelistet, UI zeigt [gelöscht]/[deleted]; Realtime-Probe
> loggt create-Event mit targetId-Payload; /en liefert englische Strings;
> typecheck/lint/test (20) grün über alle Packages.

> v2 vom 2026-06-10, abgeglichen mit der [[reddit-comment-system-setup]]
> Notiz (Brain-Vault). Übernommen: targetId+targetType statt postId,
> denormalisierte Zähler (upvotes/downvotes/score), Sortierung
> Top/New/Controversial, unbegrenzte Threading-Tiefe (rekursiv),
> Soft-Delete via status (active/reported/hidden/deleted), content bis
> 10.000 Zeichen, Komponenten-Schnitt CommentSection/Thread/Item/Form,
> useCommentStore. NICHT übernommen: "Appwrite SDK direkt" (März-Notiz,
> überschrieben durch Konzept v2: CRUD via Server Routes), Sperren/Hide-
> Moderation (→ packages/admin), E-Mail-Notifications (→ Community-
> Plattform). Presence bleibt außen vor (Cloud-only, Release-Watch läuft).
> VOR dem Start: Key nuxt-ssr-local braucht zusätzlich rows.read +
> rows.write (AdminClient aktualisiert die denormalisierten Zähler
> server-autoritativ — Voter darf fremde Kommentar-Rows nicht schreiben).

```
/goal Phase 11 laut docs/CONCEPT.md und der reddit-comment-system-setup
Spec ist abgeschlossen.
Endzustand: Migration 002 im comments-Layer baut das Schema nach Spec
um (Dev-Daten verwerfbar, drop + create erlaubt): comments mit content
(max 10.000), authorId, authorName, targetId, targetType, parentId
(nullable), upvotes/downvotes/score (integer, default 0, denormalisiert),
status (active/reported/hidden/deleted); Indizes targetId+targetType,
parentId, score, status; comment_votes unverändert mit Unique-Index.
Routes: GET /api/comments?targetId&targetType&sort=top|new|controversial
(Query.limit + Pagination; top via Query.orderDesc(score), new via
$createdAt, controversial = (up+down)/max(|score|,1) server-seitig je
Seite berechnet; Response enthält myVote des eingeloggten Users via
EINEM votes-Query, kein N+1); POST (auth, Zod, content max 10.000);
PATCH /:id (nur Autor, content); DELETE /:id → Soft-Delete (status
deleted, Row bleibt); POST /:id/vote als Upsert mit Toggle (gleicher
value erneut = Vote entfernen) — aktualisiert die Zähler upvotes/
downvotes/score server-autoritativ via AdminClient; POST /:id/report
→ status reported. Pinia useCommentStore im Layer (comments, userVotes,
sortMode, getThreadedComments als rekursiver Baum; Layer-stores via
imports.dirs). Komponenten: CommentSection (Props targetId+targetType,
Sortierauswahl, Top-Level-Form), CommentThread (rekursiv, unbegrenzte
Tiefe), CommentItem (UserAvatar, formatDate, Vote-Buttons mit eigenem
Vote-Status, Antworten inline, Melden, Bearbeiten/Löschen nur Autor,
deleted → "[gelöscht]"-Platzhalter), CommentForm (optional parentId).
Optimistic Updates für Kommentar + Vote mit Rollback; Realtime fügt
fremde Kommentare gezielt ein (where auf targetId+targetType, kein
Full-Refresh); alle Layer-Strings als i18n keys (de+en);
apps/reddit-comments bindet <CommentSection target-id="demo-post"
target-type="post" /> auf der Index-Page ein.
Nachweis: pnpm -r typecheck, lint und test grün; Migration 002 loggt
das neue Schema; curl-Sequenz gegen die lokale Instanz mit ZWEI Usern
(zweiter via Signup): Kommentare anlegen, unterschiedlich voten, dann
zeigt GET sort=top die Score-Reihenfolge mit upvotes/downvotes/score-
Feldern, sort=new die Datums-Reihenfolge, sort=controversial den
polarisierten Kommentar zuerst; Vote-Toggle: identisches Vote erneut
→ Zähler sinkt im erneuten GET; myVote im Response sichtbar; Antwort
mit parentId → curl / zeigt die verschachtelte Struktur im SSR-HTML;
DELETE → GET zeigt status deleted; Realtime-Probe loggt das
create-Event; curl /en zeigt englische Layer-Strings; für Optimistic
Updates zeigt Claude den Code-Pfad (Einfügen → Rollback im catch).
Abschluss-Schritt: der Abschnitt "Phase 11" in docs/GOALS.md ist mit ✅
und Datum markiert, README-Status aktualisiert — Teil des Nachweises.
Constraints: kein Presence (Cloud-only); Moderation nur Melden +
Soft-Delete (Sperren/Hide-UI gehört zu packages/admin); keine E-Mail-
Notifications (Community-Plattform); Schema-Änderungen NUR via
Migration 002; Realtime bleibt auf dem nativen WebSocket-Client;
CRUD ausschließlich über Server Routes (Konzept v2 überschreibt die
"SDK direkt"-Regel der März-Notiz). Maximal 45 Turns.
```

---

# 🎯 Roadmap v2 – Phasen 12+ (geplant 2026-06-10)

> Reihenfolge-Logik: erst Security-Schulden (12), dann das Admin-Grundgerüst
> mit User-Verwaltung (13), darauf die Moderation (14 — die reported-Kommentare
> aus Phase 11 liefern echtes Material), Themes (15), Deployment (16 — braucht
> Hetzner + Domain), Realtime-Rückbau (17 — wartet auf den Release-Watch).
> Backlog ganz unten. Reihenfolge 14–16 ist tauschbar, wenn Live-Gehen
> Priorität bekommt.

---

## Phase 12 – Security & Key-Hygiene ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** Login-Rate-Limit als Core-Middleware
> (server/middleware/rate-limit.ts): 5 Versuche/Minute/IP auf POST
> /api/auth/login, in-memory Map mit Pruning, 429 + Retry-After;
> Multi-Instanz-Hinweis dokumentiert, Konzept-A2-TODO abgehakt.
> Key-Trennung: Migrations-Scripts lesen NUXT_APPWRITE_MIGRATIONS_KEY
> (Fallback auf Runtime-Key mit Warnung), .env.example dokumentiert beide
> Keys; David hat migrations-local angelegt und nuxt-ssr-local auf
> sessions.write/users.rw/rows.rw/health.read reduziert.
> ABWEICHUNG vom Goal-Text (begründet): Der "Probelauf mit 001" wäre
> destruktiv gewesen — 001 hätte die alten postId-Spalten auf die neue
> 002-Table geschrieben; 001 ist jetzt ein Tombstone (verweigert den Lauf),
> als Probelauf dient das neue read-only verify-schema.ts (prüft Columns/
> Indizes/Verfügbarkeit gegen den 002-Stand). Nachweis: verify-schema mit
> Migrations-Key ✔ beide Tables vollständig; tables.create mit Runtime-Key
> → 401 general_unauthorized_scope (Scope-Reduktion bewiesen); /api/health
> mit Runtime-Key → ok:true; Rate-Limit-Sequenz: 5× falsches Passwort →
> 401, Nr. 6/7 → 429 mit retry-after: 60, nach 62s Wartezeit korrektes
> Passwort → 200; typecheck/lint/test (20) grün.

```
/goal Phase 12 (Security & Key-Hygiene) ist abgeschlossen.
Endzustand: Zwei API Keys pro Instanz (Konzept A2): die Migrations-
Scripts lesen NUXT_APPWRITE_MIGRATIONS_KEY (Fallback auf
NUXT_APPWRITE_KEY mit deutlicher Warnung), .env.example ergänzt;
David legt den Migrations-Key in der Console an und reduziert den
Runtime-Key auf sessions.write, users.read/write, rows.read/write,
health.read. Login-Rate-Limit als Nitro-Middleware im Core
(5 Versuche/Minute/IP auf POST /api/auth/login, in-memory Map,
429 mit Retry-After; dokumentierter Hinweis, dass Multi-Instanz-Prod
einen geteilten Store braucht). CONCEPT.md: Rate-Limit-TODO in A2 als
erledigt markiert.
Nachweis: curl-Sequenz: 5× falsches Passwort → 401, der 6. Versuch →
429 mit Retry-After-Header im Terminal; korrektes Passwort nach
Ablauf → 200. Migrations-Probelauf (001, idempotent) läuft mit dem
Migrations-Key durch; /api/health mit Runtime-Key → {"ok":true};
ein tables.create-Versuch mit dem Runtime-Key → 401 (beweist die
Scope-Reduktion). pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 12 ✅ + Datum, README-Status.
Constraints: kein neues npm-Package für das Rate Limiting (h3-
Bordmittel + Map); keine Schema-Änderungen; Console-Schritte macht
David (Claude fragt gezielt nach). Maximal 25 Turns.
```

---

## Phase 13 – packages/admin: Dashboard-Grundgerüst & User-Verwaltung ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** packages/admin als dritter Feature Layer
> (extends: [admin, comments, core]). dashboard.vue (Sidebar Übersicht/
> Benutzer/Kommentare, Header mit Core-UserMenu); doppelter Schutz:
> Route-Middleware admin (403-Fehlerseite) + requireAdmin(event) in jeder
> /api/admin-Route (server/utils, Nitro-Auto-Import); Core bekam users-
> Accessor am AdminClient, isAdminUser()-Util und den label-basierten
> Admin-Link im UserMenu (eigener Core-Commit). /api/admin/stats
> (Users-total + Comments-Counts parallel), /api/admin/users mit Suche +
> Pagination (User-Objekte auf sichere Felder reduziert — Server-SDK
> liefert sonst Hash-Felder mit!), Status-PATCH (Selbstblockade → 400)
> und Sessions-DELETE; users.vue mit UTable, Such-Form, UPagination und
> Bestätigungs-Modal für alle Aktionen; i18n de+en. Admin-Label am ersten
> Admin per direktem API-Call statt Console gesetzt (äquivalente Operation,
> Constraint betrifft nur die App-UI — dokumentierte Abweichung). Nachweis:
> User B → 403 auf beiden /api/admin-Routen und /admin (SSR); Admin sieht
> stats (2 User, 4 Kommentare) und die Liste mit E-Mails/Datum/Labels;
> Block → Login B 401, Unblock → 200, Selbstblockade → 400; /admin-SSR
> zeigt data-dashboard-layout + Nav; /en/admin englisch; typecheck/lint/
> test (20) grün.

```
/goal Phase 13 (Admin-Dashboard-Grundgerüst) ist abgeschlossen.
Endzustand: packages/admin als Feature Layer (App komponiert
extends: [admin, comments, core]). Grundgerüst: layouts/dashboard.vue
(Sidebar-Navigation: Übersicht/Users/Kommentare-Platzhalter, Header
mit UserMenu — zieht laut Konzept hierher); Zugriffsschutz doppelt:
Route-Middleware admin (User-Label 'admin', sonst 403-Fehlerseite)
UND serverseitiger requireAdmin(event)-Helper in JEDER /api/admin-
Route (Appwrite User Labels — David setzt das Label beim ersten
Admin-User in der Console, Claude fragt gezielt nach); der Core-
AdminClient bekommt einen users-Accessor (Users-Service,
eigener Core-Commit). Übersicht pages/admin/index.vue mit Stat-Cards
via GET /api/admin/stats: User gesamt, Kommentare gesamt, davon
reported (Users-API total + tablesDB-Counts). User-Verwaltung
pages/admin/users.vue: UTable aller registrierten User (Name, E-Mail,
registriert am via formatDate, Verifiziert, Status, Labels) mit Suche
(users.list search) und Pagination (usePagination, Query.limit);
GET /api/admin/users?search&page. Basis-Aktionen mit Bestätigungs-
Dialog: Blockieren/Entsperren (PATCH /api/admin/users/:id/status via
users.updateStatus) und Sessions invalidieren (DELETE
/api/admin/users/:id/sessions) — der eigene Account ist nicht
blockierbar (Server-Check). UserMenu im Core zeigt einen Admin-Link
nur für Admins (label-basiert). i18n keys de+en für alle
Admin-Strings.
Nachweis: curl ohne Admin-Label → 403 auf /api/admin/users und
/api/admin/stats; mit Admin-Session: users-Liste enthält die
Test-User aus Phase 4/11 mit E-Mails und Registrierungsdatum, stats
zeigt plausible Counts; Blockier-Beweis: PATCH status=blocked auf
User B → dessen Login schlägt mit 401 fehl, nach Entsperren → 200
(curl-Sequenz im Terminal); Selbstblockade → 400; curl /admin mit
Admin-Session zeigt dashboard-Layout-Markup im SSR-HTML, ohne
Admin → 403; /en/admin zeigt englische Strings.
pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 13 ✅ + Datum, README-Status.
Constraints: KEINE eigenen Tables; kein User-Delete (nur
blockieren/entsperren); keine Label-Vergabe über die UI (erster
Admin via Console — Self-Service-Privilegien-Eskalation vermeiden);
Moderations-Seite ist nur Platzhalter (→ Phase 14).
Maximal 35 Turns.
```

---

## Phase 14 – packages/admin: Moderation ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** pages/admin/comments.vue ersetzt den
> Platzhalter: Filter reported/hidden/alle (Initial-Filter aus der Query —
> die Reported-Stat-Card verlinkt auf ?status=reported), Liste mit Inhalt/
> Autor/Target/Datum/Status-Badge, Ausblenden+Wiederherstellen mit
> Bestätigungs-Modal, Pagination. Server: GET /api/admin/comments
> (Query.limit + Offset, Status-Filter) und PATCH /:id/status mit
> zod-enum NUR hidden|active — deleted als Ziel → 400, und Soft-Delete-
> Kommentare sind nicht moderierbar (Row-Check → 400). Admin definiert
> eine eigene minimale ModeratedComment-Shape statt Cross-Package-Import
> aus comments (Layer entkoppelt). Hinweis: Der Phase-11-Report ging mit
> Migration 002 (drop+create) unter — für den Nachweis wurde frisch per
> User-Report-Route gemeldet. Nachweis: User B → 403; Admin-Liste
> status=reported enthält den gemeldeten Kommentar; PATCH hidden →
> öffentlich unsichtbar (GET-Vergleich 1→0), PATCH active → wieder da
> (0→1); status=deleted → 400; hide auf deleted-Kommentar → 400;
> SSR /admin/comments zeigt Liste+Filter-Markup, /en englisch;
> typecheck/lint/test (20) grün.

> Baut auf Phase 13 auf — dashboard.vue, Zugriffsschutz und
> requireAdmin existieren dann bereits; hier kommt nur die
> Moderations-Funktionalität dazu.

```
/goal Phase 14 (Admin-Moderation) ist abgeschlossen.
Endzustand: pages/admin/comments.vue ersetzt den Platzhalter:
Moderations-Liste der Kommentare gefiltert nach status (Tabs/Filter:
reported, hidden, alle), mit Inhalt, Autor, Target und Datum;
Aktionen Ausblenden (status hidden) und Wiederherstellen (status
active) mit Bestätigung; Server Routes GET /api/admin/comments?
status=…&page= (Query.limit + Pagination) und PATCH
/api/admin/comments/:id/status (nur hidden/active als Ziel) via
AdminClient + requireAdmin; die Übersichts-Stat-Cards aus Phase 13
verlinken auf die gefilterte Liste. i18n keys de+en.
Nachweis: curl als normaler User → 403; als Admin: Liste mit
status=reported enthält den reported-Kommentar aus Phase 11;
PATCH auf hidden → der Kommentar verschwindet aus dem öffentlichen
GET /api/comments (curl-Vergleich vorher/nachher), PATCH auf active
holt ihn zurück; ungültiger Ziel-Status (z.B. deleted) → 400;
curl /admin/comments mit Admin-Session zeigt die Liste im SSR-HTML.
pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 14 ✅ + Datum, README-Status.
Constraints: KEINE eigenen Tables (admin moderiert comments-Daten);
kein Hard-Delete; Soft-Delete-Kommentare (status deleted) sind
sichtbar, aber nicht moderierbar. Maximal 25 Turns.
```

---

## Phase 15 – packages/themes (Infrastruktur + Beispiel-Themes) ✅ (abgeschlossen 2026-06-10)

> ✅ **Erledigt am 2026-06-10.** packages/themes als vierter Layer
> (extends: [themes, admin, comments, core]). Typisierte THEME_REGISTRY
> (default ohne Datei + ocean/forest/sunset als statische CSS in
> public/themes/ — generiert via Script, committet, KEINE Runtime-
> Generierung); Entscheidung Farbvariation: CSS-VARIABLEN —
> [data-theme][data-variant]-Blöcke überschreiben die Primary-Ramp
> (je 2 Varianten pro Theme), useTheme verwaltet beide Cookies
> (maui-theme, maui-theme-variant) mit Validierung gegen die Registry;
> universelles Plugin setzt data-theme/data-variant + den EINEN
> Stylesheet-Link reaktiv via useHead → alles im SSR-Head, kein Flash;
> ThemeSwitcher (USelect + Varianten-Select) hängt via app.vue global
> (statt Layout-Override — Core bleibt themes-frei). Nachweis: Cookie
> ocean → html data-theme="ocean" + link /themes/ocean.css im SSR-HTML;
> ohne Cookie und mit ungültigem Wert → 0 Theme-Attribute (Default-
> Fallback); ocean+teal → data-variant="teal"; /themes/ocean.css als
> statisches Asset (200, Layer-public-Merge funktioniert); GEGENPROBE
> Playground (ohne themes): rendert unverändert, ignoriert den Cookie.
> Nebenbefund gefixt: Playground lieferte seit Phase 4 still 404 auf /
> (Core-Pages aktivieren das Routing, app.vue hatte kein NuxtPage) —
> jetzt NuxtLayout/NuxtPage + eigene Index-Page. typecheck/lint/test grün.

> Die [[design-system]] Notiz ist bewusst dünn (Eckdaten: 26 Themes ×
> 11 Farbvariationen, useTheme + Cookie, CSS pro Theme, dynamischer
> Import) — dieses Goal baut die MECHANIK plus 3 Beispiel-Themes;
> der Vollausbau auf 26 Themes ist Backlog (reine Fleißarbeit, sobald
> die Infrastruktur steht).

```
/goal Phase 15 (packages/themes Infrastruktur) ist abgeschlossen.
Endzustand: packages/themes als Feature Layer: Theme-Registry
(typisierte Liste: id, name, CSS-Datei), 3 vollständige Themes als
eigene CSS-Dateien (CSS Custom Properties im Nuxt-UI-Token-Schema)
mit je funktionierender Farbvariations-Mechanik (primary-Variation
via ui.colors-Override oder CSS-Variablen — Entscheidung im Goal
dokumentieren); useTheme Composable: aktuelles Theme, setTheme,
Cookie-Persistenz (maui-theme), SSR-sicher — das gewählte Theme
steht als data-theme-Attribut im SSR-HTML (kein Flash); dynamischer
CSS-Import nur des aktiven Themes; ThemeSwitcher-Komponente
(USelect/UDropdownMenu); App komponiert extends: [themes, comments,
core] und der Switcher hängt im default-Layout-Slot oder UserMenu.
Nachweis: curl / mit Cookie maui-theme=<id> → SSR-HTML trägt
data-theme="<id>" und lädt die Theme-CSS (Link/Style im Head
sichtbar); ohne Cookie → Default-Theme; ungültige Cookie-Werte
fallen sauber auf den Default zurück (curl-Beweis); typecheck/lint/
test grün; Core-Apps OHNE themes-Layer rendern unverändert
(Playground-curl als Gegenprobe).
Abschluss-Schritt: GOALS.md Phase 15 ✅ + Datum, README-Status.
Constraints: Core bleibt bei EINEM Default-Theme (Konzept);
maximal 3 Themes in dieser Phase; keine Runtime-CSS-Generierung.
Maximal 30 Turns.
```

---

## Phase 16 – Auth-UX-Feinschliff (Login-Anatomy-Abgleich) ✅ (abgeschlossen 2026-06-11)

> ✅ **Erledigt am 2026-06-11.** Recovery-Flow komplett: Forgot-Link im
> LoginForm (#validation-Slot, rechtsbündig dezent), pages/forgot-password
> + reset-password, Routes POST/PUT /api/auth/recovery als GUEST-Client
> (createRecovery ist Account-Endpoint — bewusst kein Key-Scope; Antwort
> immer ok gegen Account-Enumeration); Rate-Limit-Middleware deckt recovery
> mit ab, jetzt mit EIGENEM Budget pro Route (Key ip:pathname). Register:
> Confirm-Password (refine) + AGB-Checkbox config-gated (maui.auth.termsUrl);
> Provider-Buttons config-gated (maui.auth.providers, Phosphor-Icons,
> external auf /api/auth/oauth) — Default leer; Icon + size lg (44px);
> E-Mail überlebt den Flow-Wechsel (useState + UAuthForm-Template-Ref).
> Nachweise: Gate-Matrix per curl (aus: 0 Buttons/0 Checkbox; an: github+
> google-Buttons, OR-Separator, Checkbox+AGB-Link; danach zurückgesetzt).
> E2E mit ZWEI neuen Usern: User C komplett im BROWSER (Register mit
> Confirm → Logout → Forgot-Form → Mail aus Mailpit → Reset-Page →
> Login mit neuem Passwort; altes → 401; sieht als Nicht-Admin keinen
> Admin-Menüpunkt), User D komplett per curl (Signup 200 → Login 200 →
> Recovery über unsere Route → userId+secret aus der Mailpit-API →
> PUT 200 → alt 401/neu 200). Recovery-Rate-Limit: 5×200, Nr. 6 → 429 mit
> retry-after: 60. typecheck/lint/test (20) grün. BEFUND nebenbei:
> Appwrites Mail-Worker hält die SMTP-Verbindung offen — nach Idle-Timeout
> schließt Mailpit sie und der ERSTE Send schlägt mit 421 fehl (Mail
> verloren, kein Retry); der nächste verbindet neu. Lokal kosmetisch,
> für Prod-SMTP (Phase 17) relevant: Provider/Timeout beachten.

> Aus dem Abgleich mit dem Login-Screen-Anatomy-Guide (2026-06-11).
> Bereits konform: Labels über Feldern, ergänzende Placeholder, Passwort-
> Toggle, prominenter CTA, Login↔Register-Querverlinkung. Bewusst
> ausgelassen: "Remember me" — die Session-Dauer steuert Appwrite, eine
> funktionslose Checkbox wäre eine UI-Lüge.

```
/goal Phase 16 (Auth-UX-Feinschliff) ist abgeschlossen.
Endzustand: (1) Passwort-Recovery komplett: dezenter "Passwort
vergessen?"-Link am Passwort-Feld des LoginForm; pages/
forgot-password.vue (E-Mail → POST /api/auth/recovery →
account.createRecovery, Redirect-URL auf /reset-password) und
pages/reset-password.vue (liest userId+secret aus der Query, neues
Passwort + Bestätigung → PUT /api/auth/recovery →
account.updateRecovery, Erfolg → /login mit Toast); die Rate-Limit-
Middleware deckt /api/auth/recovery mit ab (AdminClient umgeht
Appwrites Limits). (2) Register nach Guide: Confirm-Password-Feld
(Zod-refine auf Übereinstimmung) und AGB-Checkbox — config-gated über
maui.auth.termsUrl (Checkbox+Link nur wenn gesetzt, dann required).
(3) Social-Login-Buttons config-gated über maui.auth.providers
(z.B. ['github','google']): UAuthForm providers-Prop + OR-Separator,
Buttons linken auf /api/auth/oauth?provider=… — Default LEER, keine
Deko-Buttons. (4) Icon über dem Titel (UAuthForm icon-Prop) und
size lg für 44px-Touch-Targets auf Feldern + Submit. (5) Die E-Mail
überlebt den Wechsel Login↔Register (geteilter useState).
(6) i18n keys de+en für alles Neue.
Nachweis: Recovery END-TO-END mit Mailpit: curl POST
/api/auth/recovery → 200; die Mailpit-API (localhost:8025/api/v1)
zeigt die Mail und liefert den Body, daraus userId+secret extrahieren
→ PUT /api/auth/recovery mit neuem Passwort → 200; Login mit dem
NEUEN Passwort → 200, mit dem alten → 401 (curl-Sequenz im Terminal).
curl /login enthält den Forgot-Link; mit konfigurierten Providern
in der App enthält /login die Provider-Buttons, ohne Config nicht
(Gate-Gegenprobe); /register zeigt Confirm-Feld immer und die
AGB-Checkbox nur mit gesetztem termsUrl; Rate-Limit: 6. Recovery-
Request → 429; pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 16 ✅ + Datum, README-Status.
Constraints: kein Remember-me; die OAuth-Provider-KONFIGURATION in
der Appwrite Console ist nicht Teil der Phase (Buttons bleiben
config-gated aus, bis eine App sie aktiviert); Passwort-Ändern im
eingeloggten Profil bleibt Backlog. Maximal 35 Turns.
```

---

## Phase 17 – Production Deployment

> Voraussetzung: Hetzner-Server (Prod-Appwrite) und Domain sind
> bereitgestellt — wenn nicht erreichbar: stoppen und melden statt
> mocken. Secrets nur in ploi.io/GitHub Secrets, nie im Repo.

```
/goal Phase 17 (Production Deployment) ist abgeschlossen.
Endzustand: Prod-Appwrite auf Hetzner unter https://api.<domain>/v1
(Custom Domain, A3) mit Projekt, Runtime- + Migrations-Key,
registrierter Web-Plattform und durchgelaufenen Migrationen 001+002;
ploi.io-Site für apps/reddit-comments (Root Path, Build Command,
Start Command, Env Vars als Server Environment Variables);
deploy.yml-Webhook-Job aktiv (Secret PLOI_DEPLOY_WEBHOOK_…);
App live unter https://<domain> — Session-Cookie auf der Root-Domain
mit Secure-Flag, Browser-Realtime verbindet sich gegen api.<domain>.
Nachweis: curl https://<domain>/api/health → {"ok":true};
Signup→me→logout-Sequenz gegen Prod (Set-Cookie zeigt Secure +
HttpOnly); Kommentar-POST + GET gegen Prod; gh workflow run deploy
→ gh run watch completed/success und die Site antwortet nach dem
Deploy (Versions-/Marker-Check per curl).
Abschluss-Schritt: GOALS.md Phase 17 ✅ + Datum, README-Status.
Constraints: NUXT_APPWRITE_KEY & Co. niemals ins Repo; Appwrite-
Console-Schritte (Projekt, Keys, Domain-DNS) macht David auf Zuruf;
kein Auto-Deploy auf push solange kein Staging existiert
(workflow_dispatch bleibt). Maximal 40 Turns.
```

---

## Phase 18 – Realtime-Rückbau aufs SDK (wartet auf Release)

> Trigger: Der wöchentliche `appwrite-release-watch` meldet ein
> Self-Hosted-Release > 1.9.0. Vorher nicht setzbar.

```
/goal Phase 18 (Realtime-SDK-Rückbau) ist abgeschlossen.
Endzustand: OrbStack-Appwrite per Compose-Bump + `migrate` auf das
neue Release aktualisiert (Backup der compose vorher); useRealtimeRows
im Core spricht wieder das Web SDK (realtime.subscribe + Channel +
SERVER-seitige Query-Filter); die where-Option bleibt als zusätzlicher
client-seitiger Filter erhalten (API additiv, kein BREAKING CHANGE);
packages/comments nutzt Query-Filter auf targetId+targetType statt
where; realtime-probe.ts auf SDK umgestellt; A4 im CONCEPT.md auf den
neuen Stand gebracht; usePresence als optionales Composable ergänzt,
falls das Release Presences self-hosted mitbringt (sonst explizit
vertagen).
Nachweis: /v1/health/version zeigt die neue Server-Version; Probe
loggt das create-Event ÜBER das SDK; Query-Filter-Beweis wie in
Phase 10: Kommentar für fremdes Target erzeugt KEIN Event, eigenes
Target schon (beide curls + Probe-Log im Terminal); Browser-Realtime
in der App funktioniert (Realtime-Insert sichtbar via zweitem
curl-POST während die Seite offen ist — oder SSR-unabhängiger
Probe-Beweis genügt); pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 18 ✅ + Datum, README-Status;
Scheduled Task appwrite-release-watch löschen oder auf das nächste
Release umwidmen.
Constraints: Composable-Signatur bleibt stabil; Server-Upgrade nur
lokal (Prod separat, falls Phase 17 schon live ist → dann beide).
Maximal 25 Turns.
```

---

## Phase 19 – Email-OTP-Login (passwortlos, OrbStack-Stil) ✅ (abgeschlossen 2026-06-11)

> ✅ **Erledigt am 2026-06-11.** Config-Gate maui.auth.otp (Core false,
> reddit-comments true); login.vue schaltet zwischen AuthLoginForm und
> neuem AuthOtpLoginForm um (data-otp-toggle); OTP-Form zweistufig:
> E-Mail → POST /api/auth/otp (Guest, createEmailToken mit phrase:true,
> Auto-Signup unbekannter E-Mails) → UPinInput (6, otp, autofocus,
> @complete verifiziert automatisch) mit Security-Phrase-Anzeige und
> Resend-Countdown (30s); POST /api/auth/otp/verify (AdminClient
> createSession → setSessionCookie); beide Routen im Rate-Limit (eigene
> Budgets). ZUSATZ auf Zuruf: Logout-Toast in LogoutButton + UserMenu.
> Nachweise: curl-Flow mit neuem User E — OTP ok mit Phrase, Code aus
> Mailpit, verify → 200 + HttpOnly-Cookie, /api/auth/me → Auto-
> Registrierung (email gesetzt, name leer); falscher Code → 401 ohne
> Set-Cookie (und invalidiert den Token — Appwrite-Brute-Force-Schutz,
> beim Testen gelernt); OTP-Rate-Limit 5×200 → Nr. 6 429; Browser-Flow
> komplett (Toggle → E-Mail → Phrase-Abgleich UI↔Mail „Passionate jar"
> → Pin-Eingabe → Auto-Verify → Erfolgs-Toast → eingeloggt);
> Gate-Gegenprobe: Playground (Core-Default) 0 Toggle, App 1.
> STOLPERFALLEN beim Testen: (1) \d{6}-Regex fängt CSS-Hex-Farben aus
> dem Mail-Template (#414146!) — auf "Use OTP (\d{6})" matchen;
> (2) SMTP-Idle-421 schluckte erneut die jeweils erste Mail — Frische
> via Security-Phrase-Abgleich verifizieren. typecheck/lint/test (24) grün.

> Davids Wunsch vom 2026-06-11 (Referenz: OrbStack-Signup): Login/Signup
> ohne Passwort — E-Mail eingeben, 6-stelligen Code aus der Mail eintippen,
> drin. Appwrite-Mechanik: account.createEmailToken (legt unbekannte User
> automatisch an, verschickt den Code via System-SMTP → lokal Mailpit) +
> account.createSession({userId, secret: code}) → Session-Cookie wie gehabt.
> Lokal jederzeit ausführbar; Reihenfolge mit 17/18 frei tauschbar.

```
/goal Phase 19 (Email-OTP-Login) ist abgeschlossen.
Endzustand: Config-Gate maui.auth.otp (Core-Default false). Wenn aktiv:
/login zeigt zusätzlich den Tab/Switch "Mit Code anmelden" (bzw. die
OTP-Variante als eigene Page /login-code) mit Schritt 1 E-Mail-Eingabe
und Schritt 2 sechsstelligem Code-Feld (UAuthForm otp-Fieldtype oder
UPinInput) inkl. "Code erneut senden" mit Countdown; Server Routes
POST /api/auth/otp (E-Mail → createEmailToken als Guest, Antwort
enthält userId + securityPhrase, IMMER ok gegen Enumeration) und
POST /api/auth/otp/verify (userId+Code → createSession → Session-
Cookie via setSessionCookie); Rate-Limit-Middleware deckt beide
Routen mit eigenem Budget ab; falscher/abgelaufener Code → saubere
Fehlermeldung, kein Cookie; unbekannte E-Mail wird beim ersten OTP
automatisch registriert (Name leer — UserProfileForm kann ihn später
setzen); i18n keys de+en; Security-Phrase aus der Mail wird in der UI
angezeigt (Phishing-Schutz, Appwrite liefert sie mit).
Nachweis gegen die lokale Instanz mit Mailpit: curl POST /api/auth/otp
mit NEUER E-Mail → ok; Mailpit-API liefert die Mail, Code extrahieren →
POST /api/auth/otp/verify → 200 + Set-Cookie (HttpOnly sichtbar);
GET /api/auth/me mit Cookie → User-JSON der neuen E-Mail (beweist
Auto-Registrierung); falscher Code → 401 ohne Set-Cookie; 6. OTP-
Request → 429; Browser-Durchlauf: kompletter Flow inkl. Code-Eingabe
und Erfolgs-Toast; Gate-Gegenprobe: ohne maui.auth.otp keine
OTP-UI im SSR-HTML. pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 19 ✅ + Datum, README-Status.
Constraints: Passwort-Login bleibt parallel bestehen (OTP ist
Ergänzung, kein Ersatz); Email-OTP muss als Auth-Methode in der
Console aktiv sein (David prüft auf Zuruf); kein Magic-URL-Login
(separates Feature, ggf. Backlog). Maximal 35 Turns.
```

---

## Phase 20 – OTP-Registrierung komplettieren (Mini-Phase) ✅ (abgeschlossen 2026-06-12)

> ✅ **Erledigt am 2026-06-12.** /register hat den OTP-Umschalter; das
> OTP-Formular kennt einen register-Modus (eigener Titel/Beschreibung),
> ein optionales Name-Feld und im register-Modus die AGB-Pflicht-Checkbox
> bei gesetztem termsUrl; nach dem Verify wird der Name über die
> bestehende Profil-Route gesetzt — NUR wenn der Account-Name leer ist.
> Nachweise: Browser-Flow User F über /register (Toggle → Name+E-Mail+
> Checkbox, ohne Haken → Zod-Fehler "Bitte akzeptiere die AGB", mit Haken
> → Code aus Mailpit per Phrase-Abgleich → Auto-Verify → Users-API zeigt
> 'User Foxtrot' MIT Namen); Gegenprobe ohne termsUrl: keine Checkbox;
> User D behält 'User Delta'. WICHTIGER NEBENFUND mit Fix: Appwrites
> createEmailToken matcht E-Mails CASE-SENSITIV — 'userD@' legte ein
> Duplikat mit leerem Namen an, obwohl signup E-Mails lowercased!
> Fix: normalizedEmail() (trim+lowercase) als Zod-Transform in ALLEN
> E-Mail-Schemas (login/register/recovery/otp); bewiesen: Capital-D-Input
> matcht jetzt den lowercase-Account, Name bleibt erhalten, kein Duplikat;
> Alt-Duplikat gelöscht. typecheck/lint/test (24) grün.

```
/goal Phase 20 (OTP-Registrierung komplettieren) ist abgeschlossen.
Endzustand: /register zeigt mit aktivem maui.auth.otp denselben
OTP-Umschalter wie /login ("Ohne Passwort registrieren — Code per
E-Mail"); das OTP-Formular kennt einen register-Modus (eigener Titel/
Beschreibung) und bekommt im E-Mail-Schritt ein optionales Name-Feld
sowie — im register-Modus bei gesetztem maui.auth.termsUrl — die
Pflicht-AGB-Checkbox (Parität zum Passwort-Register); nach
erfolgreichem Verify wird ein angegebener Name über die BESTEHENDE
Route PUT /api/auth/profile gesetzt, aber NUR wenn der Account-Name
leer ist (bestehende User behalten ihren Namen); i18n de+en.
Nachweis: Browser-Flow User F über /register: Toggle → Name+E-Mail+
AGB-Checkbox sichtbar, Absenden ohne Haken → Zod-Fehler, mit Haken →
Code aus Mailpit (Phrase-Abgleich) → Auto-Verify → Users-API zeigt
User F MIT Namen (Auto-Signup + Name gesetzt); curl-Gegenprobe User D
(hat Namen): OTP-Verify → Name bleibt "User Delta"; ohne termsUrl
keine Checkbox (Revert + Gegenprobe); typecheck/lint/test grün.
Abschluss-Schritt: GOALS.md Phase 20 ✅ + Datum, README-Status.
Constraints: kein neuer Endpoint (Profil-Route wiederverwenden);
Auto-Signup-Verhalten unverändert; AGB-Pflicht nur im register-Modus
(Login bestehender User bleibt friktionsfrei). Maximal 20 Turns.
```

---

# 🎯 Roadmap v3 – Produkt-Arc „Community-Plattform" (geplant 2026-07-06)

> Reihenfolge-Logik: **Feed (21)** zuerst — er ist der Multiplikator, an den
> alles Spätere andockt (Events, Billing-Recovery-Hinweise, Kurs-Aktivität),
> und er nutzt maximal, was schon steht (geteilte SDK-Realtime, Presence,
> comments als erste Quelle). **Events (22)** als erstes sichtbares
> Endnutzer-Feature: eigenes Datenmodell nach comments-Muster, dockt an
> Feed + Kommentare + Presence an. **Billing (23)** genau dann, wenn es
> etwas zu verkaufen gibt — der fertige Plan liegt in
> docs/plans/BILLING-STRIPE.md, das Goal exekutiert ihn. **Courses (24)**
> als monetarisierbarer Endpunkt konsumiert alle drei: Lektions-Diskussionen
> = comments, Kurs-Aktivität = feed, Paid-Zugang = billing-Entitlements.
> Jede Stufe ist einzeln shipbar; nach jeder Phase ist das Produkt fertig
> nutzbar. Integrationsregel überall: Feature↔Feature-Imports bleiben
> verboten (A14) — Verzahnung läuft ausschließlich über Core-Verträge
> (recordActivity nach notify()-Vorbild, maui.admin.modules,
> registerUserDataContributor) oder über Komposition in der App.

---

## Phase 21 – Activity Feed (Core-Vertrag + packages/feed) ✅ (abgeschlossen 2026-07-06)

> ✅ **Erledigt am 2026-07-06.** Genau wie geplant umgesetzt: recordActivity()
> im Core (best-effort, Row-read(users)) + feed.manage; system-Migration 014
> (2× gelaufen = idempotent) + GDPR-Contributor (Export/Hard-Delete per
> actorId, List-Query degradiert vor Migration); packages/feed mit
> GET /api/feed (Cursor, Avatar-Anreicherung via resolveAvatars),
> DELETE (feed.manage), ActivityFeed/-Item (i18n feed.types.<type>,
> Open-Redirect-Guard), /feed + /dashboard/feed, ESLint-Scope; comments
> meldet comment.created (snippet als metadata). Nachweise: Gast 401;
> Kommentar → Feed-Eintrag mit korrektem link; labelloser User DELETE 403 +
> /dashboard/feed 403, Admin DELETE 200 (Row weg); Pagination 26 → 25+1
> ohne Überschneidung, ungültiger Cursor 400; SSR en („wrote a comment"
> 25×) + de („hat einen Kommentar geschrieben" 25×, /de/feed mit
> i18n-Cookie); GDPR: Export enthält activities, nach Self-Delete total 0
> auf der Instanz; Realtime im Browser: Kommentar eines zweiten Users
> erscheint live ohne Reload (25→26). typecheck/lint/test (165) grün.
> STOLPERFALLE: Lifecycle-Hooks im async Composable MÜSSEN vor dem ersten
> await registriert werden (nach useFetch-await keine Component-Instanz →
> onMounted verpufft still, Realtime lief nie; 0 Vue-Warnings nach Fix).

> Architektur-Entscheidung (Vorbild notify()/themes, A14-Matrix): der
> WRITE-Vertrag `recordActivity()` lebt im CORE (best-effort, wirft nie),
> die Table `activities` gehört SYSTEM (Migration 014), die UI-Welt gehört
> dem neuen Layer `packages/feed`. So kann comments (und später events,
> courses) Aktivitäten melden, ohne den Feed zu kennen — und der Feed
> rendert nur, was gemeldet wurde. Einträge speichern KEINE fertigen
> Sätze, sondern type + metadata; die UI übersetzt via i18n-Key
> `feed.types.<type>` (Locale-Wechsel wirkt rückwirkend, anders als bei
> notify — bewusste Abweichung).

```
/goal Phase 21 (Activity Feed) ist abgeschlossen.
Endzustand: (1) CORE, additiver Commit per A6:
server/utils/recordActivity.ts mit ActivityInput { actorId, actorName,
type (z. B. 'comment.created'), objectType, objectId, link,
metadata? (JSON-serialisierbar, klein), visibility: 'members' } —
best-effort wie notify() (wirft NIE, auslösender Request scheitert nie),
schreibt via AdminClient in die Table activities mit
Permission.read(Role.users()); neue Capability feed.manage in
shared/types/authz.ts + ALL_CAPABILITIES (Admin erbt via Wildcard).
(2) SYSTEM: Migration 014-activities.ts (idempotent, via
pnpm migrate --app) — Columns actorId, actorName, type, objectType,
objectId, link, metadata (string, JSON), visibility; Indizes idx_actor
(GDPR-Lookup), idx_type; system-User-Data-Contributor um activities
erweitert (Export + Löschung per actorId, analog senderId in 008).
(3) packages/feed als Nuxt Layer: GET /api/feed (Session enforced,
Query.limit 25 + Cursor-Pagination), DELETE /api/feed/:id
(requirePermission 'feed.manage'); Components ActivityFeed (Liste,
Realtime-Insert via useRealtimeRows auf activities, „Mehr laden"),
ActivityItem (UserAvatar, i18n-Text aus feed.types.<type> + metadata,
relative Zeit, interner Link); pages/feed.vue (auth-Middleware);
Admin-Modul 'feed' via maui.admin.modules (requiredCapability
feed.manage, Seite dashboard/feed mit Liste + Löschen einzelner
Einträge); i18n de+en, alle Strings als Keys.
(4) ERSTE QUELLE: packages/comments ruft recordActivity() beim
Kommentar-Create auf (type 'comment.created', link zur Ziel-Seite) —
comments importiert dafür NICHTS aus feed, nur den Core-Vertrag.
(5) apps/reddit-comments extended feed und verlinkt /feed in der Nav.
Nachweis gegen die lokale Instanz: Migration 014 loggt Table/Columns/
Indizes (2× laufen lassen = Idempotenz-Beweis); curl: Kommentar-POST →
GET /api/feed enthält den Eintrag mit type 'comment.created' und
korrektem link; 26+ Einträge → erste Seite 25, Cursor liefert Rest;
Realtime-Beweis (Playwright oder Probe): offener Feed zeigt einen von
einem ZWEITEN User erzeugten Kommentar live ohne Reload; labelloser
User (Memory-Regel): GET /api/feed 200, DELETE /api/feed/:id 403,
/dashboard/feed 403; Gast ohne Session: GET /api/feed 401;
GDPR: Export des Test-Users enthält seine activities,
deleteUserCompletely entfernt sie (Contributor-Log); /en zeigt
englische Feed-Strings; pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 21 ✅ + Datum, README-Status.
Constraints: Vertrag NUR im Core, Table NUR via system-Migration,
UI NUR im feed-Layer (A14-Matrix wie bei themes); recordActivity
best-effort — niemals den auslösenden Request scheitern lassen;
chronologischer Feed ohne Aggregation/Ranking (v1); keine E-Mail/
Push-Auskopplung; visibility-Wert 'public' (Gäste) ist im Typ
vorgesehen, wird aber NICHT verdrahtet (v2); keine Änderung an
useRealtimeRows-Signaturen. Maximal 40 Turns.
```

---

## Phase 22 – packages/events (Event Calendar)

> Eigenes Datenmodell nach comments-Vorbild (Feature-Layer besitzt seine
> Tables in der App-Instanz). Bewusst schlicht: Liste + Detailseite statt
> Monats-Grid, keine Recurring Events, keine Reminder-Mails — Einfachheit
> als Leitprinzip wie im Theme-Studio. Verzahnung: recordActivity (Phase
> 21), CommentSection per targetType 'event' (Komposition in der APP,
> nicht im Layer — A14), Presence via useViewingPresence auf der
> Detailseite. Teilnehmerzähler denormalisiert + server-autoritativ via
> AdminClient-Increments (Muster: comment-Votes aus Phase 11).

```
/goal Phase 22 (packages/events) ist abgeschlossen.
Endzustand: packages/events als Nuxt Layer.
shared/types/event.ts: EventRow extends Models.Row (title, description
max 10.000, startAt, endAt nullable, location nullable, url nullable,
capacity nullable, attendeeCount int default 0 denormalisiert,
status draft/published/cancelled, organizerId, organizerName) und
EventRsvpRow (eventId, userId, status going/maybe/declined).
Migration 001-events-tables.ts (idempotent, pnpm migrate --app):
events + event_rsvps, Unique-Index eventId+userId, Indizes startAt,
status. Routes: GET /api/events (nur published, Default kommende
sortiert nach startAt, ?past=true für Archiv, Query.limit +
Pagination; myRsvp des eingeloggten Users aus EINEM votes-artigen
Query, kein N+1); GET /api/events/:id; POST/PATCH mit
requirePermission('events.manage'); DELETE → Soft-Cancel (status
cancelled, Row bleibt); POST /api/events/:id/rsvp (auth, Zod, Upsert
mit Toggle; Kapazitäts-Check server-seitig VOR dem Upsert,
attendeeCount via AdminClient increment/decrement atomar);
GET /api/events/:id/ics → text/calendar mit VEVENT (kein externer
Dienst). CORE (additiver Commit per A6): Capability events.manage in
authz.ts + ALL_CAPABILITIES + RBAC-CONCEPT-Tabelle.
Components: EventList, EventCard, EventDetail (RSVP-Buttons mit
eigenem Status, Teilnehmerzahl live via useRealtimeRows,
ICS-Download, useViewingPresence „N sehen dieses Event"),
RsvpButtons; pages /events und /events/:id im Layer;
Admin-Seite dashboard/events (Anlegen/Bearbeiten/Absagen) via
maui.admin.modules (requiredCapability events.manage).
Integrationen: recordActivity 'event.published' beim Publish und
'event.rsvp' bei going-RSVP (Core-Vertrag aus Phase 21);
apps/reddit-comments extended events und bindet auf der Detailseite
<CommentSection :target-id="event.$id" target-type="event" /> ein
(Komposition in der App, KEIN Import comments↔events).
GDPR: server/plugins/user-data.ts registriert einen Contributor —
Export: eigene RSVPs + organisierte Events; Löschung: RSVPs löschen
(attendeeCount dekrementieren), organisierte Events → cancelled +
organizerName anonymisiert. Zod-Schemas als Factories, i18n de+en.
Nachweis gegen die lokale Instanz: Migration loggt Schema (2× =
idempotent); curl-Sequenz mit ZWEI Usern: Admin legt Event an +
published; labelloser User: POST /api/events → 403, RSVP going →
200 und GET zeigt attendeeCount 1 + myRsvp; RSVP-Toggle (going
erneut) → Zähler sinkt auf 0; Event mit capacity 1: zweiter User
RSVP → 409; ICS-curl enthält BEGIN:VEVENT mit korrektem DTSTART;
GET /api/feed enthält event.published + event.rsvp; SSR-HTML der
Detailseite enthält die CommentSection; Realtime-Beweis: offene
Detailseite zeigt RSVP eines zweiten Users live (Zähler springt);
GDPR-Export enthält die RSVPs; /en liefert englische Strings;
pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 22 ✅ + Datum, README-Status.
Constraints: keine Recurring Events, keine Reminder-/Einladungs-
Mails, kein Monats-Grid (Liste + Detail, v1), kein Live-Streaming;
CRUD ausschließlich über Server-Routen (SSR-first); Tables gehören
zur App-Instanz; attendeeCount-Writes NUR server-autoritativ;
Event-Erstellung ist Admin-Sache (events.manage) — „jeder User
erstellt Events" ist bewusst v2. Maximal 45 Turns.
```

---

## Phase 23 – packages/billing (Stripe) — Plan exekutieren

> Der vollständige Plan steht seit 2026-07-02 in
> docs/plans/BILLING-STRIPE.md (Architektur B1–B9, Datenmodell,
> Abläufe, Todo-Phasen B-0 bis B-8, Test-Strategie §7). Dieses Goal
> exekutiert ihn — es wiederholt die Details bewusst nicht. VOR dem
> Start: die offenen Entscheidungen aus §6 (mind. Pricing-Modell +
> Tax-Ansatz + past_due-Policy) mit David fixieren und im Plan-Dokument
> nachtragen — ohne Entscheidung stoppen und melden, nicht annehmen.
> Einordnung im Arc: Billing liefert die Entitlement-Maschine
> (getActiveSubscription/requireEntitlement/useBilling), die Phase 24
> für Paid-Kurse konsumiert. Abo-Ereignisse landen NICHT im Feed
> (privat) — nur notify() bei Zahlungsfehlschlag, wie im Plan.

```
/goal Phase 23 (packages/billing laut docs/plans/BILLING-STRIPE.md)
ist abgeschlossen.
Endzustand: alle Plan-Phasen B-0 bis B-8 umgesetzt — packages/billing
als Layer mit Config-Gate maui.billing (Core-Default enabled: false),
Tables billing_customers + billing_subscriptions (Migration idempotent,
Row-Security read(user:<userId>), Writes nur Admin-Client), Checkout
Sessions + Customer Portal (hosted, planId→lookup_key, B5-Tampering-
Schutz), Webhook als Nitro-Route mit Signatur-Verifikation, Event-
Allowlist, Upsert-Idempotenz + Stale-Guard (B4) und Rate-Limit-
Ausnahme, Entitlements (getActiveSubscription memoized,
requireEntitlement, useBilling() SSR-hydriert + Realtime auf der
eigenen Row), Capability billing.manage (additiver Core-Commit),
Admin-Modul + Seiten (pricing, account/billing, dashboard/billing),
i18n de+en, Vitest für die puren Webhook-Mappings; stripe im pnpm
Catalog; CONCEPT.md Z. 112 auf die Server-Route-Entscheidung (B1)
aktualisiert; §6-Entscheidungen im Plan-Dokument nachgetragen.
Nachweis gegen lokale Instanz + Stripe Test-Mode (Referenz Plan §7):
stripe listen --forward-to localhost:<port>/api/stripe/webhook läuft;
Browser/curl-Flow: Checkout mit 4242-Test-Card → Webhook schreibt
Row, account/billing springt via Realtime auf „aktiv" ohne Reload;
Portal-Kündigung → cancelAtPeriodEnd true im GET; stripe events
resend desselben Events → identischer Endzustand (Idempotenz);
manipulierte planId im Checkout-POST → 400; Gate-Gegenprobe:
enabled: false → Routen 404, keine Pricing-UI im SSR-HTML;
labelloser User (Memory-Regel): /dashboard/billing → 403, fremde
Subscription-Row per Web-SDK nicht lesbar; invoice.payment_failed
(stripe trigger) → status past_due + notify()-Row für den User;
Migration 2× = idempotent; pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 23 ✅ + Datum, README-Status,
BILLING-STRIPE.md auf „umgesetzt" datiert, OPEN-ITEMS-/Backlog-
Eintrag aufgelöst.
Constraints: ausschließlich Stripe TEST-Mode (kein Live-Key, Go-Live
ist ein separater Schritt mit Phase 17); Products/Prices legt David
im Dashboard an (auf Zuruf, lookup_keys wie geplant); §6-Entscheidungen
nicht eigenmächtig treffen; Feature-Gating anderer Layer NICHT
einbauen (kommt als App-Komposition in Phase 24); Secrets nur in
.env, nie ins Repo. Maximal 60 Turns.
```

---

## Phase 24 – packages/courses (Async Course Builder / LMS v1)

> Der monetarisierbare Endpunkt des Arcs — konsumiert alle drei
> Vorstufen: Lektions-Diskussion = CommentSection (targetType
> 'lesson', App-Komposition), Kurs-Aktivität = recordActivity,
> Paid-Zugang = billing-Entitlements. A14-Knackpunkt: courses darf
> billing NICHT importieren — der Layer definiert deshalb einen
> Access-Guard-Registrierungspunkt (Muster registerUserDataContributor):
> registerCourseAccessGuard() via Nitro-Plugin, die APP registriert
> den Guard und ruft darin billings requireEntitlement auf. Ohne
> registrierten Guard sind 'paid'-Kurse fail-closed (403). V1 =
> asynchrone Kurse: Markdown-Lektionen + optionale externe Video-URL,
> kein Video-Hosting. Builder nutzt useEditAwareness („David
> bearbeitet gerade") aus dem Presence-Fundament.

```
/goal Phase 24 (packages/courses, LMS v1) ist abgeschlossen.
Endzustand: packages/courses als Nuxt Layer.
shared/types/course.ts: CourseRow (title, slug unique, description,
status draft/published/archived, access 'free'|'members'|'paid',
entitlementFeature nullable — Pflicht bei 'paid', authorId,
authorName, lessonCount int denormalisiert), LessonRow (courseId,
title, order int, content Markdown max 50.000, videoUrl nullable,
status draft/published), EnrollmentRow (courseId+userId Unique,
completedAt nullable), LessonProgressRow (lessonId+userId Unique,
courseId, completedAt). Migration 001-courses-tables.ts (idempotent,
pnpm migrate --app) mit Indizes slug, status, courseId+order,
userId-Lookups. server/utils/courseAccess.ts:
registerCourseAccessGuard(guard) + assertCourseAccess(event, course)
— 'free'/'members' = eingeloggt genügt, 'paid' delegiert an den
registrierten Guard, OHNE Guard fail-closed 403.
Routes: GET /api/courses (published, Query.limit + Pagination);
GET /api/courses/:slug (Detail + Lektions-TITEL-Liste öffentlich
für Eingeloggte; Lektions-CONTENT nur nach Enrollment + Access);
POST /api/courses/:id/enroll (auth, assertCourseAccess);
GET /api/courses/:id/progress; POST /api/lessons/:id/complete
(Upsert Progress; wenn alle published-Lektionen abgeschlossen →
enrollment.completedAt server-autoritativ setzen);
Builder-Routen POST/PATCH/DELETE courses + lessons inkl.
Reorder-Endpoint, alle mit requirePermission('courses.manage').
CORE (additiver Commit per A6): Capability courses.manage.
UI Learner: pages /courses (Galerie), /courses/:slug (Übersicht,
Enroll-CTA je access-Typ inkl. „Upgrade"-Zustand bei paid),
/courses/:slug/lessons/:id (LessonView: Markdown XSS-sicher
gerendert — kein Raw-HTML, Lehre aus dem Themes-CSS-Sink-Audit;
optionales Video-Embed; „Lektion abschließen"; Fortschrittsbalken;
Prev/Next). UI Builder: dashboard/courses (Liste) +
dashboard/courses/:id (Lektionen anlegen/sortieren/publishen,
useEditAwareness-Anzeige) via maui.admin.modules mit children.
Integrationen: recordActivity 'course.published' und
'course.completed'; apps/reddit-comments (Pilot) extended courses,
bindet in LessonView <CommentSection :target-id="lesson.$id"
target-type="lesson" /> ein UND registriert den Access-Guard, der
billings requireEntitlement(event, course.entitlementFeature)
aufruft (server/plugins — die App darf beide Layer komponieren).
GDPR-Contributor: Enrollments + Progress exportieren/löschen;
authorName auf Kursen anonymisieren. Zod-Factories, i18n de+en.
Nachweis gegen die lokale Instanz: Migration loggt Schema (2× =
idempotent); Flow per curl mit ZWEI Usern: Admin erstellt Kurs mit
3 Lektionen (eine draft) + published → GET /api/courses zeigt ihn,
lessonCount 2; labelloser User: POST /api/courses → 403,
/dashboard/courses → 403, enroll free-Kurs → 200, Lektions-Content
ohne Enrollment vorher → 403; complete 2/2 published-Lektionen →
progress 100 % und completedAt im Enrollment gesetzt (draft-Lektion
zählt NICHT); paid-Kurs: User ohne Abo → 403, User mit aktivem
Test-Abo aus Phase 23 → enroll 200 (Guard-Beweis über die echte
billing-Verdrahtung); Gegenprobe im Playground (kein Guard
registriert): paid-Kurs → 403 fail-closed; XSS-Probe: <script> und
<img onerror> im Lektions-Content erscheinen im SSR-HTML escaped,
nicht ausgeführt; GET /api/feed zeigt course.published +
course.completed; SSR der LessonView enthält die CommentSection;
GDPR-Export enthält Enrollments + Progress; /en englische Strings;
pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 24 ✅ + Datum, README-Status;
Roadmap-v3-Arc im README als abgeschlossen markieren.
Constraints: kein Video-Hosting/-Streaming (nur externe URLs),
keine Quizzes/Zertifikate/Drip-Content (v2), kein Einzelkauf von
Kursen (Zugang NUR über Abo-Entitlements aus Phase 23 — Einzelkauf
wäre ein neuer Checkout-Mode, bewusst vertagt); courses importiert
NICHTS aus billing/comments/feed — Verzahnung nur über Core-Verträge
+ App-Komposition; Markdown-Rendering ohne Raw-HTML;
Schema-Änderungen nur via Migration. Maximal 60 Turns.
```

---

## Phase 25 – packages/posts (Community-Feed: Posts, Polls, Questions) ✅ (abgeschlossen 2026-07-07)

> ✅ **Erledigt am 2026-07-07.** Wie geplant (P1–P7): Layer mit Migrationen
> 001+002 (community_posts + poll_votes; 002 zieht die create(users)-Table-
> Permission nach — SessionClient-Create lief sonst in Appwrite-401;
> existingColumnKeys-Vorprüfung wegen column_limit_exceeded bei body 10000),
> alle Routen inkl. publish-on-read, Poll-Votes mit Toggle/Wechsel/Race-
> Behandlung, zweiphasigem Hide, Scheduled-Queue, Moderations-Sicht mit
> Report-Zählern; Markdown-Sink dafür in den CORE gehoben (shared/markdown +
> MarkdownContent, comments migriert — ein Eigentümer); UI mit Composer-Tabs,
> Poll-Balken (verdeckt bis zur eigenen Stimme), Realtime-Pille,
> #comments-Slot (App bindet CommentSection); Rate-Limit-Buckets posts:*.
> Nachweise: alle drei Typen 201, Gast GET 200/POST 401; Poll-Sichtbarkeit
> (B sieht Prozente, Admin ohne Stimme nicht), Wechsel/Toggle/422/401,
> Vote nach pollEndsAt 409 + Ergebnisse für alle; PATCH nach Fremdstimme
> 409; scheduled-Post unsichtbar → per publish-on-read live + post.published
> im Activity-Feed (5 Einträge); Hide: Feed weg + Roh-REST 404, Restore
> stellt beides her, labelloser User 403; Report mit Grund → Moderations-
> Zähler; GDPR: Export (posts+pollVotes), Tombstone (status deleted, body/
> authorName leer), Votes hard-deleted; XSS escaped im SSR; Browser: Pille
> „Neue Beiträge (1)" ohne Auto-Prepend, Poll-Klick 0→3 Balken „2 Stimmen",
> CommentSection im Slot; /en-Strings; typecheck/lint/178 Tests grün.
> STOLPERFALLEN: Table brauchte explizit Permission.create(Role.users())
> (comments-002-Muster); zsh-Spezialvariablen GID/EUID sind readonly-
> numerisch — nie als Shell-Variablennamen in Test-Scripts verwenden.

> Einordnung im Roadmap-v3-Arc: logisch DIREKT nach Phase 21 (und vor
> Events) — der Member-Content-Feed ist das Herz der Community-Plattform;
> Events (22) und Courses (24) docken später an dieselben Muster an.
> Plan mit allen Entscheidungen (P1–P7): docs/plans/COMMUNITY-POSTS.md —
> Kern: EIN Datenmodell mit type post/poll/question; Antworten sind der
> comments-Layer (targetType 'post', App-Komposition); Poll-Votes
> server-autoritativ, Ergebnisse erst nach eigener Stimme; Scheduled
> Questions ohne Cron (publish-on-read); member-led (jeder postet) mit
> Rate-Limit + generischem moderation-Vertrag + posts.moderate.

```
/goal Phase 25 (packages/posts laut docs/plans/COMMUNITY-POSTS.md)
ist abgeschlossen.
Endzustand: packages/posts als Feature-Layer. Migration 001
(idempotent, pnpm migrate --app): community_posts (type post/poll/
question, title nullable, body Markdown max 10.000, authorId/Name,
status scheduled/published/hidden/deleted, scheduledAt/publishedAt,
pollOptions JSON max 6, pollEndsAt; Indizes status+publishedAt,
authorId, status+scheduledAt) + poll_votes (Unique postId+userId,
Index postId+optionIndex). Routen: GET /api/posts (published,
Cursor-Pagination, publish-on-read für fällige scheduled-Posts,
myVote je Poll aus EINEM Query, Poll-Zählung über gebündelte
Count-Queries); POST /api/posts (auth, Zod-Factories je Typ,
eigenes Rate-Limit-Budget); PATCH/DELETE /:id (nur Autor; Soft-
Delete; Poll nach erster Fremdstimme nicht mehr editierbar);
POST /:id/vote (Toggle/Wechsel, gesperrt nach pollEndsAt, 401 für
Gäste); POST /:id/hide und /:id/restore (requirePermission
'posts.moderate', zweiphasig wie comments: Row-read-Permission-
Entzug); GET /api/posts/scheduled (eigene Warteschlange).
CORE (additiv, eigener Commit): Capability posts.moderate in
authz.ts + ALL_CAPABILITIES + RBAC-CONCEPT-Tabellen.
Rows: Permission.read(Role.any()) (hidden verliert sie),
update/delete nur Autor; poll_votes ohne breite Read-Permission.
UI: Seite /community (Composer mit Tabs Beitrag/Umfrage/Frage +
optionalem Planen-Termin; Feed mit PostCard/PollCard/QuestionCard;
Poll-Balken mit Prozenten NACH eigener Stimme oder nach pollEndsAt;
Realtime-Pille „Neue Beiträge anzeigen" statt Auto-Prepend;
Kommentare je Karte aufklappbar — die APP bindet CommentSection
target-type='post' ein, kein comments-Import im Layer);
dashboard/posts via maui.admin.modules (posts.moderate): Moderation
(Hide/Restore, gemeldete Posts via moderation-Layer targetType
'post') + globale Scheduled-Queue. Markdown-Rendering ohne
Raw-HTML (CommentMarkdown-Muster). recordActivity
'post.published' beim (auch verzögerten) Publish + Meilenstein
milestone.posts (Core-Erweiterung der Union, additiv).
GDPR-Contributor: Posts → Tombstone (deleted, Inhalt geblankt),
poll_votes → Hard-Delete. i18n de+en; Zod-Factories;
apps/reddit-comments extended posts, /community in der Nav.
Nachweis gegen die lokale Instanz: Migration 2× (Idempotenz);
curl-Flows mit ZWEI Usern + Admin: Post/Frage/Poll erstellen (je
201), Gast GET /api/posts 200 aber POST 401; Poll: User B stimmt →
GET als B zeigt Prozente + myVote, GET als drittem User OHNE Stimme
zeigt KEINE Prozente; Stimm-Wechsel ändert Zählung; nach pollEndsAt
(kurz setzen) → vote 4xx und Prozente für alle; Autor-PATCH nach
Fremdstimme → 4xx; scheduled-Post mit scheduledAt in 5 s → sofort
NICHT im GET, nach Ablauf erscheint er per publish-on-read UND
erzeugt den Feed-Eintrag post.published (GET /api/feed); Hide durch
Admin → Post verschwindet aus GET + Roh-REST-Read der Row schlägt
fehl (Row-Permission weg), Restore stellt beides her; labelloser
User: hide → 403; Report-Flow: User meldet Post → taucht in der
Moderations-Queue auf; GDPR: Export enthält Posts + Votes, Delete
tombstonet Posts (Poll mit Fremdstimmen bleibt als [gelöscht])
und löscht Votes; XSS-Probe: <script>/<img onerror> im Body
erscheinen escaped; Realtime-Beweis (Browser): zweiter User postet
→ Pille erscheint ohne Reload, Klick zeigt den Post; /en englische
Strings; pnpm -r typecheck, lint und test grün.
Abschluss-Schritt: GOALS.md Phase 25 ✅ + Datum, README-Status,
COMMUNITY-POSTS.md auf „umgesetzt" datiert.
Constraints: KEINE eigene Kommentar-/Reaction-Implementierung
(comments-Layer via App-Komposition); kein Cron/Worker (publish-
on-read); keine Bild-Uploads, keine Recurrence, kein AI (alles v2,
Plan §1); Tables gehören zur App-Instanz; Feed-Layer bleibt
unangetastet (nur recordActivity-Aufrufe); §5-Annahmen des Plans
gelten als bestätigt, wenn David nichts anderes sagt.
Maximal 60 Turns.
```

---

## Backlog (ohne Phase — bei Bedarf zu Goals schneiden)

- **Themes-Vollausbau**: 26 Themes × 11 Farbvariationen, sobald die
  Phase-15-Infrastruktur steht (Fleißarbeit, gut automatisierbar)
- **packages/billing**: Stripe Checkout/Webhooks/Subscriptions —
  ✂️ als **Phase 23** geschnitten (2026-07-06, Roadmap v3);
  Plan: docs/plans/BILLING-STRIPE.md
- **Activity Feed / Events / Courses**: ✂️ als **Phasen 21/22/24**
  geschnitten (2026-07-06, Roadmap v3 — Produkt-Arc Community-Plattform)
- **E2E-Tests (Playwright)** pro App — Konzept A13 sagt "wenn Core
  stabil"; der Core ist jetzt stabil, sinnvoll nach Phase 14
- **CHANGELOG.md + Git-Tags** für den Core (Konzept A6 "mittelfristig")
- **usePresence** — falls nicht schon in Phase 18 abgedeckt
- **obsidian-community-concept**: Integration des comments-Layers in
  die Community-Plattform (targetType space/note ist vorbereitet)

---

## Tipps

- **Ein Goal pro Phase, nicht alles auf einmal** — kleinere, verifizierbare Einheiten = weniger Evaluator-Fehlschlüsse, weniger Token-Verschwendung.
- Wenn ein Goal hängt: `/goal pause`, Zwischenstand anschauen, Bedingung präzisieren, neu setzen.
- Vor jedem neuen Goal: kurzer Blick auf `git log` — Fable committed unterwegs; saubere Conventional Commits sind in der CLAUDE.md verankert.
- Marker-Strings ("MAUI-CORE-SMOKE" etc.) nach bestandener Phase wieder entfernen lassen — oder als dauerhafte Smoke-Tests in Vitest überführen.
