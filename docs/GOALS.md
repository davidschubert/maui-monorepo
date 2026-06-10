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

## Phase 2 – Design-Fundament

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

## Phase 3 – Appwrite SSR-Fundament

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

## Phase 4 – Auth

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

## Phase 5 – Layouts & User Components

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

## Phase 6 – Utilities, SEO & Analytics-Gate

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

## Phase 7 – i18n

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

## Phase 8 – Testing

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

## Phase 9 – CI / Deployment

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

## Phase 10 – packages/comments Feature Layer

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

> Goal-Text entsteht aus der [[reddit-comment-system-setup]] Roadmap,
> sobald Phase 10 steht — UI/UX, Threading-Tiefe, Sortierung (hot/new/top),
> Optimistic Updates und Presence (sobald self-hosted verfügbar) werden
> dort als eigene Goals geschnitten.

---

## Tipps

- **Ein Goal pro Phase, nicht alles auf einmal** — kleinere, verifizierbare Einheiten = weniger Evaluator-Fehlschlüsse, weniger Token-Verschwendung.
- Wenn ein Goal hängt: `/goal pause`, Zwischenstand anschauen, Bedingung präzisieren, neu setzen.
- Vor jedem neuen Goal: kurzer Blick auf `git log` — Fable committed unterwegs; saubere Conventional Commits sind in der CLAUDE.md verankert.
- Marker-Strings ("MAUI-CORE-SMOKE" etc.) nach bestandener Phase wieder entfernen lassen — oder als dauerhafte Smoke-Tests in Vitest überführen.
