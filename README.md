# 🏝️ Maui Monorepo

Nuxt 4 Monorepo mit zentralem **Core Layer** und komponierbaren **Feature Layers** — die gemeinsame Basis für alle Maui-Projekte. Auth, Appwrite-Integration, Design-Fundament und Utilities werden einmal implementiert und per `extends` in beliebig viele Apps eingebunden.

> Vollständiges Konzept: [docs/CONCEPT.md](docs/CONCEPT.md) · Phasen-Roadmap: [docs/GOALS.md](docs/GOALS.md)

## Architektur — drei Ebenen

```
packages/core            ← Ebene 1: Fundament (besitzt KEINE Appwrite Tables!)
packages/system          ← Fundament: Infra-Tabellen (audit_logs, app_config, notifications)
packages/*               ← Ebene 2: Feature Layers (themes, comments, moderation, admin; billing geplant)
apps/*                   ← Ebene 3: dünne Apps, komponieren Core + Features
```

```ts
// apps/<app>/nuxt.config.ts
export default defineNuxtConfig({
  extends: [
    '../../packages/comments', // früher gelistet = höhere Priorität
    '../../packages/core',
  ],
})
```

- **`packages/core`** stellt ausschließlich Code bereit — keine Daten, keine Tables, kein Schema. Jede App nutzt ihre **eigene Appwrite-Instanz** (Config via `.env`).
- **Feature Layers** bringen eigenes Datenmodell und/oder eigene UI-Welt mit. Sie extenden den Core nicht selbst — die App komponiert beides.
- **Apps** bleiben dünn: nur Komposition, Branding und app-spezifische Pages. Die App überschreibt alles (Components, Layouts, `app.config.ts` wird tief gemergt).

## Stack

| Technologie | Rolle |
|---|---|
| Nuxt 4 (SSR) + Nuxt UI 4 | Framework + UI-Komponenten |
| Appwrite (self-hosted ≥ 1.9.5, MariaDB, TablesDB) | Backend: Auth, Datenbank, Storage, Realtime, Presences |
| node-appwrite / appwrite | Server SDK (CRUD via Server Routes) / Web SDK (Realtime + Presences API) |
| Pinia · Zod · @nuxtjs/i18n (de+en) | State · Validierung · Internationalisierung |
| Tailwind CSS 4 · TypeScript strict | Styling · Typsicherheit |
| pnpm Workspaces + Catalog | Monorepo, zentrale Versionsverwaltung |

Geteilte Dependency-Versionen sind ausschließlich im Catalog ([pnpm-workspace.yaml](pnpm-workspace.yaml)) definiert — `package.json` referenziert `"catalog:"`.

## Setup

Voraussetzungen: **Node 22** (`.nvmrc`), **pnpm 10** und eine laufende **Appwrite-Instanz ≥ 1.9.5** (self-hosted, z. B. via Docker/OrbStack). Empfohlener DB-Adapter: **MariaDB** (Appwrites dokumentierter Default; MongoDB ist als Multi-Adapter neuer/weniger erprobt).

```bash
pnpm install
```

**1. Appwrite-Instanz vorbereiten** (einmalig, interaktiv in der Appwrite-Console):
- Account anlegen, **Projekt** erstellen, **Datenbank mit ID `main`** anlegen.
- **API-Key** mit allen Scopes erzeugen.

**2. `.env` setzen** — pro App unter `apps/<app>/.env`:
```dotenv
NUXT_PUBLIC_APPWRITE_ENDPOINT="http://localhost/v1"
NUXT_PUBLIC_APPWRITE_PROJECT_ID="reddit-comments"
NUXT_PUBLIC_APPWRITE_DATABASE_ID="main"
NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET="avatars"
NUXT_APPWRITE_KEY="<dein-api-key>"            # server-only, alle Scopes
NUXT_APPWRITE_MIGRATIONS_KEY="<dein-api-key>" # für Migrationen (kann derselbe sein)
```

**3. Bootstrap** — legt Datenbank + Avatars-Bucket + Web-Platform an und fährt **alle Migrationen** in Reihenfolge (system→comments→moderation→admin):
```bash
pnpm --filter reddit-comments bootstrap          # frische Instanz aufsetzen
pnpm --filter reddit-comments bootstrap --seed   # + Demo-User & -Kommentare
```
> ⚠️ Primär für **frische** Instanzen: ein Sicherheits-Guard bricht ab, wenn die `comments`-Tabelle schon Daten hat. `comments-002` ist inzwischen idempotent (droppt nicht mehr, wenn das Zielschema schon steht) — der Erst-Umbau vom alten `postId`-Schema baut das Schema aber weiterhin destruktiv neu auf. `--force` überschreibt den Guard.

**4. Starten**:
```bash
pnpm dev:app     # reddit-comments App (Port 3001)
pnpm dev:core    # Core Playground (Port 3000)
pnpm typecheck   # Typecheck über die Apps (deckt alle Layer transitiv)
```

Demo-Login (nach `--seed`): `uma@demo.local` / `Demo-Passw0rd!` (regulär), `mod@demo.local` (Moderator), `admin@demo.local` (Admin) — Passwort jeweils `Demo-Passw0rd!`.

### Skripte

| Befehl | Wirkung |
|---|---|
| `pnpm --filter reddit-comments bootstrap [--seed]` | Frische Instanz: DB + Bucket + Platform + alle Migrationen (optional Seed) |
| `pnpm --filter reddit-comments seed [--force]` | Demo-User (Rollen) + Kommentare (idempotent; `--force` re-seedet) |
| `pnpm --filter @maui/<layer> migrate` | Migrationen eines Layers idempotent ausführen |
| `pnpm dev:app` · `pnpm dev:core` | Dev-Server (App 3001 · Core-Playground 3000) |
| `pnpm typecheck` · `pnpm -r lint` · `pnpm -r test` | Qualitäts-Checks über den Workspace |

## Struktur

```
maui-monorepo/
├── packages/
│   ├── core/                  # Nuxt Layer: Fundament
│   │   ├── app/               # Components, Composables, Stores, …
│   │   └── .playground/       # isolierte Dev-Umgebung (Port 3000)
│   ├── system/                # Fundament-Layer: Infra-Tabellen (Migrationen, kein UI)
│   ├── comments/              # Feature Layer: Kommentarsystem (Threads, Votes, Reports-UI)
│   │   ├── app/components/    # CommentThread, CommentForm, VoteButtons, ReportButton
│   │   ├── server/api/        # GET/POST /api/comments (Thread-Pagination), Vote-Upsert
│   │   └── scripts/migrations/ # idempotente Schema-Migrationen
│   ├── moderation/            # Fundament-Layer: generisches Melde-/Report-System (reports-Table)
│   ├── admin/                 # Feature Layer: Dashboard, Moderation-Queue, Changelog, Audit, …
│   └── themes/                # Feature Layer: Theming
├── apps/
│   ├── _template/             # Kopiervorlage für neue Apps (Port 3002, README mit Schritten)
│   └── reddit-comments/       # dünne App: extends [themes, admin, comments, moderation, core, system] (Port 3001)
│       └── scripts/           # bootstrap.ts (Fresh-Instance-Setup), seed-demo.ts (Demo-Daten)
├── docs/
│   ├── CONCEPT.md             # Architektur-Konzept (v2)
│   ├── GOALS.md               # Phasen-Roadmap mit /goal-Texten
│   ├── APPWRITE-1.9.5-UPGRADE.md # Upgrade-/Feature-Plan (Realtime/Presence/Email-Policies)
│   ├── AUTH-FORMS.md          # UAuthForm-als-Vorlage-Entscheidung + Abweichungen
│   ├── plans/                 # umsetzungsreife Pläne (GDPR, Phase 17, Billing, Themes, Embed, Changelog 2B)
│   └── OPEN-ITEMS.md          # offene Punkte / erledigte Referenz
├── pnpm-workspace.yaml        # Workspaces + Catalog
└── CLAUDE.md                  # Claude Code Kontext
```

Ports: Core Playground **3000** · reddit-comments **3001** · weitere Apps 3002+

## Status

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Monorepo Setup (Workspace, Core Layer, App-Komposition) | ✅ 2026-06-09 |
| 2 | Design-Fundament (Nuxt UI Theme, Tailwind 4) | ✅ 2026-06-09 |
| 3 | Appwrite SSR-Fundament (Admin/Session Client) | ✅ 2026-06-10 |
| 4 | Auth (SSR, Session-Cookie, UAuthForm) | ✅ 2026-06-10 |
| 5 | Layouts & User Components (prefs-basiert) | ✅ 2026-06-10 |
| 6 | Utilities, SEO & Analytics-Gate (config-gated) | ✅ 2026-06-10 |
| 7 | i18n (de Default + en, Layer-Merge) | ✅ 2026-06-10 |
| 8 | Testing (Vitest Unit Tests im Core) | ✅ 2026-06-10 |
| 9 | CI (typecheck/lint/test auf GitHub Actions) | ✅ 2026-06-10 |
| 10 | `packages/comments` Feature Layer (Tables, Realtime, Votes) | ✅ 2026-06-10 |
| 11 | Reddit Comment System App (Threading, Sortierung, Optimistic UI) | ✅ 2026-06-10 |
| 12 | Security & Key-Hygiene (Rate-Limit, Key-Trennung) | ✅ 2026-06-10 |
| 13 | `packages/admin`: Dashboard-Grundgerüst & User-Verwaltung | ✅ 2026-06-10 |
| 14 | `packages/admin`: Moderation | ✅ 2026-06-10 |
| 15 | `packages/themes` (Infrastruktur + 3 Themes) | ✅ 2026-06-10 |
| 16 | Auth-UX-Feinschliff (Recovery-Flow, Provider-Buttons, Confirm/AGB) | ✅ 2026-06-11 |
| 17 | Production Deployment (Hetzner, ploi.io, Custom Domain) | 🔜 |
| 18 | Realtime/Presence auf SDK — Presence komplett auf Presences-API ✅ · P1 Rows-Rückbau ✅ (eine geteilte JWT-SDK-Realtime) | ✅ 2026-07-01 |
| 19 | Email-OTP-Login (passwortlos) | ✅ 2026-06-11 |
| 20 | OTP-Registrierung (Name, AGB, E-Mail-Normalisierung) | ✅ 2026-06-12 |
| 21 | RBAC: Capabilities, Rollen (admin/moderator), Guards, Audit | ✅ 2026-06-25 |
| 22 | Layer-Grenzen-Matrix (A14) + ESLint-Import-Backstop | ✅ 2026-06-27 |
| 23 | `packages/moderation`: generisches Melde-/Report-System + Queue | ✅ 2026-06-27 |
| 24 | comments: Thread-Pagination (rootId/depth), „bearbeitet", Reply-Notification-Link | ✅ 2026-06-28 |
| 25 | `packages/system`: Infra-Tabellen ausgelagert (core↔admin-Inversion gelöst) | ✅ 2026-06-27 |
| 26 | Tests (RBAC/Sort/Thread/Vote) + Dedup + Deploy-Runbook | ✅ 2026-06-29 |
| 27 | Pre-Production Security-Review + Cleanup + total-Semantik (Cascade-Hide) + notify()-Vertrag | ✅ 2026-06-30 |
| 28 | Appwrite 1.9.0 → **1.9.5** Upgrade + Umstieg **MongoDB → MariaDB** (Bootstrap-Odyssee) | ✅ 2026-07-01 |
| 29 | Presence auf **Presences-API** (P2), Bootstrap-/Seed-Tooling, Demo-Daten + XSS-Security-Test | ✅ 2026-07-01 |
| 30 | Presence vereinheitlicht (globale + Thread + Moderation auf 1 Presence), Alt-Code entfernt; Use-Cases: Moderations-Claim-Lock, Edit-Awareness, Live-Online | ✅ 2026-07-01 |
| 31 | Echtes Realtime-Presence (JWT-WS, ~280ms) + Presence-Use-Cases (Betrachtung/Antwort/Lese-Präsenz, Avatar-Status-Icons) | ✅ 2026-07-01 |
| 32 | Realtime-Konsolidierung (P1): `useRealtimeRows` auf 1 geteilte JWT-SDK-Realtime · `comments-002` idempotent · Changelog Track 2B (Function-Scaffold) · Playwright-E2E-Smoke | ✅ 2026-07-01 |
| 33 | Gesamtcheck (5 Review-Agenten + Docs-Abgleich Appwrite/Nuxt/Nuxt UI): 20+ Fixes — Moderations-Bypass, Deleted-Content-Leak, Realtime-Auth-Kopplung, Presence-Leaks, SSR-Hydration (Votes/Reports), Rate-Limits, JWT-Härtung, mist-@theme, ESLint-Backstop moderation | ✅ 2026-07-02 |
| 34 | Gesamtcheck-Abarbeitung: ALLE offenen Findings (Vote-Privacy, hidden-REST-Leak via Row-Permissions, toH3Error-Serie, 9 Client-Bugs, Vote-Lost-Update, Cursor-Pagination-Kanten, i18n) + Migrations-Runner & `apps/_template` + @-Mentions + Markdown-Kommentare + 6 Pläne unter docs/plans/ | ✅ 2026-07-02 |
| 35 | GDPR komplett: UserDataContributor-Vertrag (A14), vollständige Löschung (Tombstone/Hard-Delete/Pseudonymisierung) + vollständige Exporte, Pre-Delete-Snapshots (`gdpr-exports`, 30-Tage-Cleanup, Admin-UI) — 41/41 Live-Checks | ✅ 2026-07-02 |
| 36 | Observability-Gate `maui.observability`: strukturierte JSON-5xx-Logs am zentralen error.ts + Client-Error-Inbox (rate-limited), Sentry-Andockpunkt — live verifiziert | ✅ 2026-07-02 |

Details und Nachweis-Kriterien pro Phase: [docs/GOALS.md](docs/GOALS.md) · Upgrade-Plan: [docs/APPWRITE-1.9.5-UPGRADE.md](docs/APPWRITE-1.9.5-UPGRADE.md) · Offene Punkte: [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md)

## Konventionen

- [Conventional Commits](https://www.conventionalcommits.org) · Breaking Changes im Core mit `BREAKING CHANGE(core):` Prefix und eigenem Commit
- Branches: `main` / `dev` / `feature/*` / `fix/*`
- Im Layer nur relative Pfade (kein `~/` oder `@/`) · Domain-Types in `shared/types/`
- CRUD nur über `server/api/*` — das Web SDK macht im Browser ausschließlich Realtime
