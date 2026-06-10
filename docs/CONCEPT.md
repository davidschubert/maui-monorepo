# 🏗️ Maui Core Layer – Nuxt Monorepo

> **Stand:** Juni 2026 · Konzept v2 — SSR-Architektur, TablesDB, Feature-Layer-Ebene

## Projektbeschreibung

Das `maui-monorepo` ist die gemeinsame Basis für alle Maui-Projekte. Ein zentraler Nuxt Layer (`packages/core`) liefert Auth, Appwrite-Integration, Design-Fundament, Typen und Utilities — einmal implementiert, per `extends` in beliebig viele Apps eingebunden. Darüber liegt eine **Feature-Layer-Ebene** (Themes, Comments, Admin, Billing, …), aus der sich Apps ihre Funktionalität zusammenstellen.

---

## Architektur: Drei Ebenen

```
packages/core            ← Ebene 1: Fundament (besitzt KEINE Appwrite Tables!)
packages/themes          ← Ebene 2: Feature Layers (optional, eigenes Datenmodell
packages/comments           und/oder eigene UI-Welt)
packages/admin
packages/billing
apps/*                   ← Ebene 3: Apps komponieren Core + Feature Layers
```

```ts
// apps/reddit-comments/nuxt.config.ts
export default defineNuxtConfig({
  extends: [
    '../../packages/comments',   // früher gelistet = höhere Priorität
    '../../packages/core',
  ],
})
```

**Kompositions-Regeln:**
- In `extends` haben **früher gelistete Layer Vorrang** vor späteren; die App selbst überschreibt alles
- Feature Layers extenden den Core **nicht** selbst — sie setzen seine Konventionen voraus, die App komponiert beides (hält Feature Layers entkoppelt und einzeln testbar)
- Apps werden dünn: `apps/reddit-comments` ist nur noch Komposition + Branding, die Logik lebt in `packages/comments`

**Entscheidungs-Framework — was gehört in den Core?**

| Code-Art | Kosten wenn ungenutzt | Konsequenz |
|---|---|---|
| Components, Composables, Types, Schemas, Utils | ~Null (tree-shaked, nur gebundelt was genutzt wird) | Core darf großzügig sein |
| Module, Plugins, globales CSS, Server Middleware | Laufen in **jeder** App | Core muss streng sein |

Vier Prüffragen pro Feature:
1. Braucht das praktisch jede App? (>90%)
2. Ist es produktneutral (keine Domain-Logik)?
3. **Hat es eigene Appwrite Tables? → Wenn ja: niemals Core** (härteste Regel)
4. Zieht es ein Modul/Plugin rein, das immer lädt? → Nur in den Core wenn Frage 1 = Ja

---

## Stack & Tooling

| Technologie | Version (Stand 06/2026) | Rolle |
|---|---|---|
| Nuxt | 4.4.x (aktuell 4.4.8) | Framework (Composition API, SSR) |
| Nuxt UI | 4.8.x (aktuell 4.8.2) | UI-Komponentenbibliothek (inkl. `UAuthForm`) |
| Appwrite (self-hosted) | 1.9.0 | Backend: Auth, TablesDB, Storage, Realtime |
| Pinia | latest | State Management |
| node-appwrite | latest, 1.9-kompatibel pinnen* | **Server SDK** — Auth + TablesDB via Server Routes |
| appwrite (Web SDK) | latest, 1.9-kompatibel pinnen* | **Nur Realtime** im Browser |
| Tailwind CSS | 4.x | Styling |
| Zod | latest | Schema Validation |
| @nuxtjs/i18n | latest | Internationalisierung (de + en) |
| TypeScript | strict | Typsicherheit |
| pnpm Workspaces | latest | Monorepo-Verwaltung |

> *Die Appwrite Docs pflegen eine Tabelle, welche SDK-Versionen zu welchem Self-Hosted-Release passen — SDKs entsprechend pinnen statt blind `latest`.

> **Warum pnpm?** npm hoisted alles in Root `node_modules` → Phantom Dependencies → Bugs in CI/Deploy. pnpm erzwingt saubere Dependency-Deklaration pro Package, ist schneller und Standard im Nuxt/Vite Ecosystem.

> **Terminologie (Appwrite 2025+):** `Databases` → `TablesDB`, `Collections/Documents` → `Tables/Rows`. Immer die neue API nutzen (`tablesDB.createRow()` etc.) — nur sie unterstützt Transactions, Bulk Ops, Atomic Ops. Self-hosted Stand: **1.9.0** (TablesDB, Query-gefilterte Realtime-Subscriptions + explizite TablesDB-Channels, Realtime-Metriken, Resource-based API Keys, Multiple Application Domains pro Projekt, Sparse Updates — `updateRow` sendet nur geänderte Attribute).

---

## `packages/` Ordner – Strategie

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

```
packages/   ← Geteilter Code — Bausteine, keine vollständigen Apps
apps/       ← Vollständige, deploybare Nuxt-Applikationen
```

| Package | Status | Inhalt |
|---|---|---|
| `packages/core` | ✅ Aktiv | Nuxt Layer: SSR-Auth, Appwrite-Fundament, Design-Basis, Utils |
| `packages/themes` | 🔜 Geplant | 26-Theme-System + `useTheme` (siehe [[design-system]]) |
| `packages/comments` | 🔜 Geplant | Reddit-Kommentarsystem als wiederverwendbarer Layer |
| `packages/admin` | 🔜 Geplant | Admin Dashboard, User-Verwaltung, `dashboard.vue` Layout |
| `packages/billing` | 🔜 Zukunft | Stripe: Checkout, Webhooks, Subscriptions |
| `packages/types` | 🔜 Zukunft | Geteilte TS Types (wenn core zu groß) |
| `packages/utils` | 🔜 Zukunft | Reine JS-Utilities ohne Nuxt |
| `packages/config` | 🔜 Zukunft | Geteilte ESLint-, TS-, Tailwind-Configs |
| `packages/appwrite-functions` | 🔜 Zukunft | Appwrite Functions (Webhooks, CRON, Events) |

**Feature-Layer-Begründungen:**
- **`themes`** — Das Multi-Theme-System (26 Themes × 11 Farbvariationen, Cookie-Persistenz) ist zu viel fürs Fundament. Core liefert Token-Struktur + ein Default Theme; wer Theme-Switching braucht, extended `themes`. Ein Kundenprojekt hat genau ein Branding.
- **`comments`** — Eigenes Datenmodell (comments, votes Tables) → Regel 3. Components, Server Routes, Realtime-Anbindung, Migrations, Types — alles im Layer, in jede App einbindbar.
- **`admin`** — Braucht den `AdminClient` mit erweiterten Rechten, viel UI, nicht jede App hat einen Admin-Bereich. Das `dashboard.vue` Layout zieht hierher um.
- **`billing`** — Eigene Tables (subscriptions), schwere Dependency (Stripe SDK). Webhooks laufen als Appwrite Function.
- Zukünftige SaaS-Bausteine (Forum, News, Polls) → je ein eigener Feature Layer.

> **Für jetzt:** Erst `core` bauen, dann `comments`. `themes`/`admin` entstehen wenn gebraucht — kein vorzeitiges Aufteilen.

---

## Dependency- & Kompositions-Strategie

### Third-Party-Bibliotheken sind keine Packages

`packages/` ist nur für **eigenen geteilten Code**. Nuxt UI, Pinia, Zod etc. sind npm-Dependencies — im Core installiert und als Modul registriert:

```ts
// packages/core/nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n'],
})
```

Module aus Layern werden in jeder extendenden App **mitgeladen** — wer den Core extended, hat Nuxt UI automatisch. Komponenten landen aber nur im Bundle wenn genutzt (tree-shaked): `UAuthForm` und pures Tailwind können problemlos nebeneinander auf derselben Page leben.

⚠️ Wegen `shamefully-hoist=false` müssen geteilte Dependencies (z.B. `@nuxt/ui`) **zusätzlich in der `package.json` jeder App** deklariert sein, nicht nur im Core.

### pnpm Catalogs — eine Version für alle

Damit Core, Feature Layers und Apps nie auf unterschiedlichen Versionen laufen, werden geteilte Dependencies zentral definiert:

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
catalog:
  nuxt: ^4.4.8
  '@nuxt/ui': ^4.8.2
  '@pinia/nuxt': ^0.11.0
  zod: ^4.0.0
  node-appwrite: <1.9-kompatibel>
  appwrite: <1.9-kompatibel>
```

```jsonc
// packages/core/package.json + apps/*/package.json
{ "dependencies": { "@nuxt/ui": "catalog:" } }
```

Versions-Bump = eine Stelle (`pnpm-workspace.yaml`), garantiert konsistent über das gesamte Monorepo.

### Drei Kompositions-Stufen pro Projekt

| Stufe | `extends` | Wann |
|---|---|---|
| **App mit Core** | `[features..., core]` | Braucht Auth / Appwrite / Design-Basis. Nuxt UI ist da, Tailwind pur trotzdem jederzeit möglich. |
| **App ohne Core** | keins / leer | Z.B. Landingpage ohne Backend — lebt trotzdem im Monorepo (profitiert von Catalogs, Tooling, Deploy-Workflow), pures Nuxt + Tailwind. |
| **Standalone** | — | One-Pager / Spezialfälle (z.B. GSAP-Page à la PUK) außerhalb des Monorepos. |

Keine Einbahnstraße: Braucht die Landingpage später Auth oder ein Formular mit Backend, genügt eine Zeile `extends: ['../../packages/core']` — und das Fundament ist da.

---

## Monorepo Verzeichnisstruktur

```
maui-monorepo/
│
├── packages/
│   │
│   ├── core/                              # ✅ Nuxt Layer – Fundament
│   │   ├── app/
│   │   │   ├── assets/css/main.css        # Tailwind 4 Basis + @source
│   │   │   ├── components/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── LoginForm.vue      # baut auf UAuthForm (Nuxt UI 4) auf
│   │   │   │   │   ├── RegisterForm.vue   # baut auf UAuthForm auf
│   │   │   │   │   └── LogoutButton.vue
│   │   │   │   ├── user/
│   │   │   │   │   ├── UserAvatar.vue
│   │   │   │   │   ├── UserMenu.vue
│   │   │   │   │   └── UserProfileForm.vue
│   │   │   │   └── consent/
│   │   │   │       └── CookieBanner.vue   # rendert nur wenn config-gated aktiv
│   │   │   ├── composables/
│   │   │   │   ├── useCurrentUser.ts      # User-State (SSR-hydratisiert)
│   │   │   │   ├── useRealtimeRows.ts     # Realtime Wrapper (Web SDK, client-only)
│   │   │   │   ├── usePresence.ts         # Presences API (siehe Hinweis unten)
│   │   │   │   ├── useStorage.ts          # Appwrite Storage via Server Routes
│   │   │   │   ├── useSeo.ts
│   │   │   │   ├── useAnalytics.ts        # config-gated
│   │   │   │   ├── useCookieConsent.ts    # config-gated
│   │   │   │   ├── usePagination.ts
│   │   │   │   ├── useToast.ts
│   │   │   │   ├── useFormatDate.ts       # DE: dd.MM.yyyy
│   │   │   │   └── useFormatCurrency.ts   # 1.234,56 €
│   │   │   ├── stores/
│   │   │   │   └── useAuthStore.ts        # Pinia: user, isLoggedIn
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts                # Route Middleware → /login
│   │   │   │   └── guest.ts               # → / wenn eingeloggt
│   │   │   ├── layouts/
│   │   │   │   ├── default.vue            # Nav + Footer
│   │   │   │   └── auth.vue               # zentriert, kein Nav
│   │   │   ├── pages/
│   │   │   │   ├── login.vue              # ✨ neu: Apps funktionieren out-of-the-box
│   │   │   │   ├── register.vue           # ✨ neu (beides überschreibbar)
│   │   │   │   └── error.vue
│   │   │   ├── plugins/
│   │   │   │   ├── auth.server.ts         # hydratisiert User aus h3 context
│   │   │   │   └── analytics.client.ts    # lädt NUR wenn app.config es aktiviert
│   │   │   └── utils/
│   │   │       └── appwrite.client.ts     # Web SDK Client (nur Realtime)
│   │   │
│   │   ├── server/
│   │   │   ├── lib/
│   │   │   │   └── appwrite.ts            # createAdminClient + createSessionClient
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts                # event.context.user pro Request
│   │   │   └── api/auth/
│   │   │       ├── signup.post.ts
│   │   │       ├── login.post.ts
│   │   │       ├── logout.post.ts
│   │   │       └── oauth/
│   │   │           ├── index.get.ts
│   │   │           └── callback.get.ts
│   │   │
│   │   ├── shared/
│   │   │   └── types/
│   │   │       ├── h3.d.ts                # H3EventContext.user Augmentation
│   │   │       └── appwrite.ts            # Base Types auf Models.Row
│   │   │
│   │   ├── schemas/
│   │   │   └── auth.ts                    # Zod: loginSchema, registerSchema
│   │   ├── i18n/
│   │   │   ├── de.json                    # Shared Strings
│   │   │   └── en.json
│   │   ├── scripts/migrations/
│   │   │   └── README.md                  # nur Konvention — Core hat KEIN Schema!
│   │   ├── .playground/                   # isolierte Dev-Umgebung (Port 3000)
│   │   ├── app.config.ts                  # Maui Default Theme + maui.* Defaults
│   │   ├── nuxt.config.ts                 # Module, runtimeConfig Skeleton
│   │   └── package.json
│   │
│   ├── themes/                            # 🔜 Feature Layer
│   ├── comments/                          # 🔜 Feature Layer (eigene Tables!)
│   ├── admin/                             # 🔜 Feature Layer
│   └── billing/                           # 🔜 Feature Layer
│
├── apps/
│   ├── reddit-comments/                   # dünn: Komposition + Branding
│   │   ├── app/                           # nur Overrides + app-spezifische Pages
│   │   ├── scripts/migrations/
│   │   ├── app.config.ts                  # Theme-Override + maui.* Gates
│   │   ├── nuxt.config.ts                 # extends: [comments, core]
│   │   ├── .env                           # eigene Appwrite-Instanz!
│   │   └── package.json
│   └── (weitere Projekte)
│
├── .github/workflows/                     # typecheck, lint, deploy
├── .nvmrc                                 # Node 22
├── pnpm-workspace.yaml
├── package.json                           # Root: nur dev tooling
├── tsconfig.json
└── .npmrc                                 # shamefully-hoist=false
```

---

## Architektur-Entscheidungen

### A1 — Core besitzt null Tables (verschärft)

**Der Core Layer stellt ausschließlich Code bereit — keine Daten, keine Tables, kein Schema.** Jede App hat ihre **eigene Appwrite-Instanz** (eigene Project ID, eigene Database), konfiguriert via `.env`. Sobald etwas ein eigenes Datenmodell mitbringt, ist es ein Feature Layer oder App-Code.

User-Profile: über Appwrite Account `prefs` lösen — keine `profiles` Table im Core.

- Kundenprojekte: Daten von Kunde A nie in derselben Instanz wie Kunde B (DSGVO)
- Eigene Projekte: saubere Trennung, unabhängige Deployments/Backups
- Lokal: OrbStack · Eigene Projekte: Hetzner · Kundenprojekte: Appwrite Cloud auf Kundenaccount

### A2 — SSR-Architektur mit zwei Clients ✨ neu

Der Core ist SSR-first (`ssr: true`). CRUD läuft **nie** direkt vom Browser gegen Appwrite, sondern über Nuxt Server Routes:

- **`createAdminClient()`** — API Key (`runtimeConfig.appwriteKey`, server-only). Für privilegierte Operationen: Signup, Admin-Aktionen, Rate-Limit-Bypass. Seit 1.9.0: **Resource-based API Keys** nutzen — Key nur mit den Scopes ausstatten, die der Core braucht (z.B. `sessions.write`), kein Vollzugriff.
- **`createSessionClient(event)`** — pro Request neu erstellt, liest das Session-Cookie. Agiert als der User.
- **Web SDK im Browser: nur Realtime.** Kein CRUD aus `<script setup>` (Doppel-Fetch, Hydration-Probleme).

**Kritische Regel:** Clients nie über Requests teilen — sonst leakt eine User-Session in fremde Responses.

Pattern: typisierter Appwrite-Call → typisierter `defineEventHandler` → typisierter `useFetch` auf der Page. SDK-Generics nutzen: `tablesDB.listRows<Comment>(...)` statt Casting.

### A3 — Session-Cookie: `a_session_<PROJECT_ID>` ✨ neu

Cookie-Name **`a_session_<PROJECT_ID>`** statt Custom Name. Grund: Das Web SDK im Browser erkennt dieses Cookie automatisch → **Realtime läuft authentifiziert** statt anonym. Genau der Use Case des Kommentarsystems.

Voraussetzungen:
- Appwrite-Endpoint auf einer **Subdomain derselben Root-Domain** wie die App (z.B. App `comments.example.com`, Appwrite `api.example.com`) — Custom Domain pro Projekt auf die self-hosted Instanz legen
- Cookie auf der Root-Domain setzen (`Domain=.example.com`)
- Immer `httpOnly: true, secure: true, sameSite` setzen (XSS-Schutz)
- 1.9.0 unterstützt **Multiple Application Domains pro Projekt** (CORS + OAuth) — pro App alle Domains in der Appwrite Console registrieren (auch `localhost` für Dev)

Fallback dokumentiert: Custom Name (`app-session`) wenn kein authentifiziertes Browser-Realtime nötig (einfacher, keine Custom Domain).

### A4 — Realtime & Presences ✨ neu

- **Realtime self-hosted: vollständig verfügbar.** 1.9.0: Subscriptions mit Query-Filtern (nur passende Events statt aller Table-Änderungen — z.B. nur Kommentare eines Posts) + Metriken.
- `useRealtimeRows()`: `import.meta.server` Guard (SSR → no-op), Cleanup via `onScopeDispose` (funktioniert auch in Stores/Composables), Channel via `Channel.tablesdb(db).table(t).row()`.
- ⚠️ **Channel-Prefix ≠ Event-Prefix:** Subscription-Channels nutzen `tablesdb.…`, die Event-Strings im Payload weiterhin `databases.…` — beim Filtern auf Suffix matchen (`.create`, `.update`, `.delete`).
- **Presences API: Stand Juni 2026 nur Appwrite Cloud**, noch nicht in self-hosted 1.9.0. Appwrite rollt Cloud-first aus → landet erwartbar im nächsten Self-Hosted-Release. `usePresence()` daher als optionales Composable bauen — Apps funktionieren ohne.

### A5 — Analytics & DSGVO-Consent: im Core, config-gated ✨ neu

Code liegt einmal im Core, ist aber tot bis die App ihn aktiviert:

```ts
// apps/<app>/app.config.ts
export default defineAppConfig({
  maui: {
    analytics: { enabled: true, provider: 'plausible' },
    consent: { enabled: true },
  },
})
```

Core-Default: `enabled: false`. Das `analytics.client.ts` Plugin prüft das Gate **bevor** irgendein Script lädt. Internes Tool = komplett clean, öffentliche Seite = drei Zeilen.

### A6 — Breaking Changes im Core

1. Additive Changes bevorzugen (neue Props mit Default statt umbenennen/entfernen)
2. Core-Änderungen immer in eigenem Commit (`BREAKING CHANGE(core):` Prefix)
3. Vor Core-Update alle Apps lokal kurz starten

Kein formales semver solange solo — Git-Tags als optionale Checkpoints, mittelfristig CHANGELOG.md.

### A7 — Override-Strategie

App > früher gelisteter Layer > später gelisteter Layer. `app.config.ts` wird tief gemergt — App überschreibt nur was nötig. Der Core ist kein Gefängnis: jede App kann gezielt Components, Layouts, Pages ersetzen (wichtig für Kunden-Branding).

### A8 — Kundenprojekte: Monorepo oder separat?

| Szenario | Empfehlung |
|---|---|
| Kunde bekommt keinen Code-Zugriff | Im Monorepo unter `apps/` |
| Kunde bekommt eigenes Repo | Separates Repo, Core als Git Submodule |
| Kunde deployed/wartet selbst | Separates Repo, Core als privates npm Package |

Für jetzt: alles im Monorepo. Migration raus ist einfacher als rein.

### A9 — Deployment: ploi.io mit Monorepo

```
Root Path:      apps/reddit-comments
Build Command:  pnpm --filter reddit-comments build
Start Command:  node apps/reddit-comments/.output/server/index.mjs
```

Deploy-Script: `npm i -g pnpm && pnpm install --frozen-lockfile && pnpm --filter <app> build`. Env Vars in ploi.io als Server Environment Variables (nie als Datei).

### A10 — Migrations

Appwrite hat kein eingebautes Migrations-System → manuelle Scripts (`npx tsx scripts/migrations/001-….ts`), nie automatisch im Deploy. **Core hat kein Schema** — nur die Konvention + README. Feature Layers und Apps bringen eigene Migrations mit (z.B. `packages/comments/scripts/migrations/001-comments-tables.ts`). Beim Server-Upgrade (z.B. 1.8→1.9) immer die Appwrite-Migration sauber durchlaufen lassen.

### A11 — Environment Variables

```bash
# apps/<app>/.env.example
NUXT_APPWRITE_KEY=                          # server-only! API Key, nie public
NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.<app-domain>/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID=
NUXT_PUBLIC_APPWRITE_DATABASE_ID=
NUXT_PUBLIC_APP_URL=https://<app-domain>
```

`runtimeConfig` im Core mit Leer-Defaults definieren (Typ-Inferenz), echte Werte aus `.env`/Host. **Der API Key gehört nie in `runtimeConfig.public`.** Nie `.env` committen, nur `.env.example`.

### A12 — Node.js, Ports, Git

- `.nvmrc`: Node 22 (nvm lokal, ploi.io + GitHub Actions via `node-version-file`)
- Ports: Core Playground 3000, reddit-comments 3001, weitere 3002+ · parallel: `pnpm --parallel -r dev`
- Branches: `main` / `dev` / `feature/*` / `fix/*` · Conventional Commits
- `.gitignore`: `.env*` (außer `.env.example`), `.nuxt/`, `.output/`, `node_modules/`

### A13 — Testing

Vitest Unit Tests für Core Composables ohne Browser-Abhängigkeit (`useFormatDate`, `useFormatCurrency`, `usePagination`). Component Tests vorerst nicht (Nuxt Component Testing mit Layers fehleranfällig). E2E mit Playwright pro App — erst wenn Core stabil.

---

## Core Layer – Detailspezifikation

### Auth (SSR)

**Server (`server/`):**
- `lib/appwrite.ts` — `createAdminClient()` + `createSessionClient(event)`, lazy `get`-Accessors für Services
- `middleware/auth.ts` — setzt `event.context.user` pro Request (try/catch, undefined wenn keine Session)
- `api/auth/signup.post.ts` — Account erstellen (AdminClient) + Session + Cookie in einem Request
- `api/auth/login.post.ts` / `logout.post.ts` / `oauth/*` — `createOAuth2Token` → Callback → `createSession`

**App:**
- `plugins/auth.server.ts` — hydratisiert User aus h3 context in den Store (kein Client-Fetch beim Start)
- `useCurrentUser()` + Pinia `useAuthStore` (user, isLoggedIn)
- `LoginForm.vue` / `RegisterForm.vue` — auf **`UAuthForm`** (Nuxt UI 4) aufbauen statt UForm von Hand
- Route Middleware `auth.ts` / `guest.ts`
- `pages/login.vue` + `register.vue` — out-of-the-box, überschreibbar

**Shared:**
- `shared/types/h3.d.ts` — `H3EventContext.user?: Models.User<Models.Preferences>`
- Zod Schemas (`loginSchema`, `registerSchema`) — deutsche Fehlermeldungen via i18n keys

### TablesDB-Zugriff

Kein generischer Client-CRUD-Composable mehr. Stattdessen das dokumentierte **Server-Route-Pattern**, das Feature Layers kopieren:

```
shared/types/<entity>.ts     →  interface X extends Models.Row
server/api/<entity>/*.ts     →  createSessionClient(event) + tablesDB.listRows<X>()
app/pages/…                  →  useFetch('/api/<entity>')
```

Immer explizites `Query.limit(...)` setzen (Default 25 → stille Trunkierung).

### Design-Fundament

- `app.config.ts` — Maui Default Theme (Nuxt UI: primary, neutral, radius, fonts)
- `main.css` — Tailwind 4 `@import` + `@source` + CSS Custom Properties
- Color Tokens: primary / secondary / neutral / success / warning / error / info
- Das 26-Theme-System lebt in `packages/themes` (siehe [[design-system]])

### Utilities

`useSeo` (OG/Twitter Defaults) · `usePagination` · `useToast` · `useFormatDate` (dd.MM.yyyy) · `useFormatCurrency` (1.234,56 €) · `useStorage` (Upload/Preview/Delete via Server Routes)

### i18n

`@nuxtjs/i18n` im Core (Modul lädt in jeder App — bewusste Entscheidung wegen DACH-Fokus). Shared Strings in `i18n/de.json`/`en.json` (Validierung, Auth, generische UI), Apps ergänzen eigene. Layer lokal im Monorepo halten (Remote-Layer-Bug).

---

## Implementierungs-Roadmap

### Phase 1 – Monorepo Setup
- [ ] Root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc` (22), Root `tsconfig.json`
- [ ] pnpm Catalog für geteilte Dependencies definieren (nuxt, @nuxt/ui, pinia, zod, appwrite SDKs)
- [ ] `packages/core/` als Nuxt Layer initialisieren (`nuxi init --template layer`)
- [ ] `.playground/` einrichten (Port 3000)
- [ ] `apps/reddit-comments/` initialisieren, `extends` einbinden (Port 3001)
- [ ] Smoke Test: Komponente aus Core in App rendern, HMR prüfen

### Phase 2 – Design-Fundament
- [ ] Nuxt UI 4 in Core installieren + konfigurieren
- [ ] Maui Default Theme in `app.config.ts`
- [ ] `main.css` mit Tailwind 4 + `@source` für Layer-Pfad
- [ ] Override-Test: App-`app.config.ts` überschreibt Core Theme

### Phase 3 – Appwrite SSR-Fundament
- [ ] `node-appwrite` (Server) + `appwrite` (Web, Realtime) installieren
- [ ] `server/lib/appwrite.ts` — AdminClient + SessionClient
- [ ] `runtimeConfig` Skeleton (`appwriteKey` privat + `public.*`)
- [ ] `server/middleware/auth.ts` + `shared/types/h3.d.ts`
- [ ] `app/utils/appwrite.client.ts` (Web SDK, nur Realtime)
- [ ] `useRealtimeRows()` mit SSR-Guard
- [ ] Custom Domain für Appwrite-Endpoint einrichten (A3), CORS-Plattformen registrieren
- [ ] `.env.example` pro App

### Phase 4 – Auth
- [ ] Server Routes: signup, login, logout, OAuth
- [ ] Session-Cookie `a_session_<PROJECT_ID>` (httpOnly, secure, sameSite, Root-Domain)
- [ ] `plugins/auth.server.ts` + `useAuthStore` + `useCurrentUser()`
- [ ] Zod Schemas
- [ ] `LoginForm`/`RegisterForm` auf `UAuthForm`-Basis + `LogoutButton`
- [ ] Route Middleware + `pages/login.vue`/`register.vue`
- [ ] End-to-End-Test in reddit-comments: Browser-Realtime läuft authentifiziert

### Phase 5 – Layouts & User Components
- [ ] `layouts/default.vue` + `auth.vue` (dashboard → später `packages/admin`)
- [ ] `UserAvatar`, `UserMenu`, `UserProfileForm` (prefs statt eigener Table)
- [ ] `pages/error.vue`

### Phase 6 – Utilities, SEO, Analytics-Gate
- [ ] `useSeo`, `usePagination`, `useToast`, `useFormatDate`, `useFormatCurrency`, `useStorage`
- [ ] `maui.*` Defaults in Core `app.config.ts` (analytics/consent: false)
- [ ] `analytics.client.ts` Plugin mit Config-Gate + `useAnalytics` + `CookieBanner` + `useCookieConsent`
- [ ] Test: App ohne Gate lädt kein Script

### Phase 7 – i18n
- [ ] `@nuxtjs/i18n` in Core, `de.json` + `en.json`
- [ ] Test: App übernimmt Core Translations + ergänzt eigene

### Phase 8 – Testing
- [ ] Vitest in Core, Unit Tests für Format-/Pagination-Composables

### Phase 9 – CI / Deployment
- [ ] `typecheck.yml`, `lint.yml`, `deploy.yml` (mit `node-version-file: .nvmrc`)
- [ ] ploi.io: Root Path + Build Command pro App, Env Vars

### Phase 10 – `packages/comments` Feature Layer ✨ neu
- [ ] Layer-Struktur: Components, Server Routes, `shared/types/comment.ts`
- [ ] Migration: comments + votes Tables (eigene Instanz der App)
- [ ] Realtime via `useRealtimeRows<Comment>` mit Query-Filter auf postId
- [ ] In `apps/reddit-comments` komponieren — App bleibt dünn

### Phase 11 – Reddit Comment System App
- [ ] Weiter mit [[reddit-comment-system-setup]] Roadmap
- [ ] `usePresence()` nachrüsten sobald Presences self-hosted verfügbar

---

## Bekannte Stolperfallen & Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Session leakt zwischen Usern | Appwrite Client über Requests geteilt | Pro `H3Event` neuen `SessionClient` erstellen |
| Doppel-Fetch / Hydration-Bugs | Web SDK CRUD aus `<script setup>` | CRUD immer über `server/api/*`, Web SDK nur Realtime |
| API Key geleakt | Key in `runtimeConfig.public` | Key nur in privatem `runtimeConfig.appwriteKey` |
| Web SDK blockiert | CORS-Plattform nicht registriert | `localhost` + Prod-Domain in Appwrite Console |
| Listen still abgeschnitten | Query-Default-Limit 25 | Immer explizites `Query.limit(...)` |
| Realtime-Events matchen nicht | Channel-Prefix `tablesdb.` vs. Event-Prefix `databases.` | Auf Event-Suffix matchen (`.create` etc.) |
| Realtime crasht den Build | WebSocket im SSR-Kontext | `import.meta.server` Guard im Composable |
| Browser-Realtime läuft anonym | Custom Cookie-Name, Web SDK liest ihn nicht | `a_session_<PROJECT_ID>` + Custom Domain (A3) |
| Types im Server nicht sichtbar | Types in `app/types/` | Domain-Types in `shared/types/` |
| HMR funktioniert nicht im Layer | Layer-Pfad falsch / `tsconfig.json` im Layer | Layer in `packages/`, kein eigenes `tsconfig.json` |
| Tailwind-Klassen aus Layer ignoriert | Tailwind scannt Layer-Pfad nicht | `@source "../../../packages/core"` in App-`main.css` |
| `~/`/`@/` Alias im Layer kaputt | Aliases relativ zur App aufgelöst | Im Layer nur relative Pfade |
| Dependency in App nicht gefunden | Nur im Core deklariert | Shared Dependencies auch in App-`package.json` |
| i18n bricht im Layer | Remote Layer Path Bug | Layer lokal im Monorepo halten |
| ploi deployed falsches Verzeichnis | Root Path nicht gesetzt | `apps/<app-name>` als Root Path |
| Auth bricht nach Appwrite-Upgrade | Migration nicht durchgelaufen | Beim Server-Upgrade immer `migrate` ausführen |
| Port-Konflikt | Alle Apps auf 3000 | Eigener Port pro App in `package.json` |

---

## Claude Code – CLAUDE.md Inhalt

> 📁 **Gepflegte Dateien liegen in [[setup|claude-code/]]**: `CLAUDE.md` (→ Repo-Root), `goals.md` (/goal-Texte aller 11 Phasen), `setup.md` (Kickoff-Anleitung). Der Block unten ist die Referenz-Kopie — bei Änderungen beide Stellen pflegen.

```markdown
# Maui Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo (maui-monorepo) mit zentralem Core Layer + Feature Layers.

## Stack
- Nuxt 4 (Composition API, SSR), Nuxt UI 4, Pinia, Tailwind CSS 4
- node-appwrite (Server SDK) + appwrite (Web SDK, NUR Realtime)
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Feature Layers (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [features..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)

## Appwrite (SSR-first, TablesDB)
- Terminologie: TablesDB / Tables / Rows (NICHT Databases/Collections/Documents)
- Zwei Server-Clients: createAdminClient (API Key) + createSessionClient
  (pro Request, NIE teilen!) in server/lib/appwrite.ts
- CRUD NUR über server/api/* (Session enforced, Validierung zentral),
  NIE Web SDK CRUD aus <script setup>
- Web SDK im Browser: nur Realtime (useRealtimeRows, import.meta.server Guard)
- Session-Cookie: a_session_<PROJECT_ID>, httpOnly+secure+sameSite,
  Appwrite-Endpoint als Subdomain derselben Root-Domain
- Jede App: EIGENE Appwrite-Instanz, Config aus .env
  (NUXT_APPWRITE_KEY server-only, NUXT_PUBLIC_* für Endpoint/Project)
- Immer explizites Query.limit() (Default 25)
- SDK-Generics nutzen: tablesDB.listRows<T>()
- Presences API: Stand 06/2026 nur Cloud, usePresence optional halten

## Config-Gates (app.config.ts, Namespace maui.*)
- maui.analytics / maui.consent: Core-Default false, App aktiviert explizit
- app.config.ts wird tief gemergt — App überschreibt nur was nötig

## Coding Rules
- <script setup lang="ts">, Nuxt UI Komponenten bevorzugen (UAuthForm für Auth!)
- Pinia defineStore Composition Style
- Relative Pfade im Layer (kein ~/ oder @/)
- Domain-Types in shared/types/ (nie app/types/ — Server sieht sie sonst nicht)
- Zod für alle Formulare, i18n keys für User-facing Strings
- pnpm, TypeScript strict (kein any), vollständige Dateien, keine Spekulation
- Dependencies via pnpm Catalog: Versionen zentral in pnpm-workspace.yaml,
  package.json referenziert "catalog:" — geteilte Deps auch in App-package.json

## Ports
core/.playground: 3000 · reddit-comments: 3001 · weitere: 3002+

## Git
Conventional Commits · BREAKING CHANGE(core): Prefix · Core-Änderungen
in eigenem Commit · vor Core-Update alle Apps lokal starten
```

---

## Verknüpfte Projekte

- [[reddit-comment-system-setup]] – wird als `packages/comments` Feature Layer umgesetzt
- [[design-system]] – wird als `packages/themes` Feature Layer umgesetzt

---

## Notizen & Entscheidungen

- **2026-06-09:** Konzept v2 — Projekt umbenannt (fleava → maui). SSR-Architektur mit zwei Clients beschlossen, TablesDB-Terminologie, Cookie `a_session_<PROJECT_ID>` + Custom Domain, Analytics/Consent config-gated im Core, Feature-Layer-Ebene (themes/comments/admin/billing) eingezogen, Core-Regel verschärft: null Tables. Presences API noch nicht self-hosted (nur Cloud) — usePresence optional.

---

## Referenzen

- [Nuxt Layers Docs](https://nuxt.com/docs/4.x/guide/going-further/layers)
- [Nuxt 4 Docs](https://nuxt.com/docs/4.x/getting-started/introduction)
- [Nuxt UI Docs](https://ui.nuxt.com) · [UAuthForm](https://ui.nuxt.com/docs/components/auth-form)
- [Appwrite SSR Auth](https://appwrite.io/docs/products/auth/server-side-rendering)
- [Appwrite Nuxt SSR Tutorial](https://appwrite.io/docs/tutorials/nuxt-ssr-auth)
- [Appwrite TablesDB Rows](https://appwrite.io/docs/products/databases/rows)
- [Appwrite Realtime](https://appwrite.io/docs/apis/realtime)
- [Appwrite Custom Domains](https://appwrite.io/docs/advanced/platform/custom-domains)
- [pnpm Workspaces](https://pnpm.io/workspaces) · [Zod](https://zod.dev) · [Nuxt i18n](https://i18n.nuxtjs.org)
- [Offizielles Nuxt Monorepo Beispiel](https://github.com/nuxt/example-layers-monorepo)
- [Conventional Commits](https://www.conventionalcommits.org)
