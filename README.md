# 🏝️ Maui Monorepo

Nuxt 4 Monorepo mit zentralem **Core Layer** und komponierbaren **Feature Layers** — die gemeinsame Basis für alle Maui-Projekte. Auth, Appwrite-Integration, Design-Fundament und Utilities werden einmal implementiert und per `extends` in beliebig viele Apps eingebunden.

> Vollständiges Konzept: [docs/CONCEPT.md](docs/CONCEPT.md) · Phasen-Roadmap: [docs/GOALS.md](docs/GOALS.md)

## Architektur — drei Ebenen

```
packages/core            ← Ebene 1: Fundament (besitzt KEINE Appwrite Tables!)
packages/*               ← Ebene 2: Feature Layers (themes, comments, admin, billing)
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
| Appwrite (self-hosted, TablesDB) | Backend: Auth, Datenbank, Storage, Realtime |
| node-appwrite / appwrite | Server SDK (CRUD via Server Routes) / Web SDK (nur Realtime) |
| Pinia · Zod · @nuxtjs/i18n (de+en) | State · Validierung · Internationalisierung |
| Tailwind CSS 4 · TypeScript strict | Styling · Typsicherheit |
| pnpm Workspaces + Catalog | Monorepo, zentrale Versionsverwaltung |

Geteilte Dependency-Versionen sind ausschließlich im Catalog ([pnpm-workspace.yaml](pnpm-workspace.yaml)) definiert — `package.json` referenziert `"catalog:"`.

## Setup

Voraussetzungen: **Node 22** (`.nvmrc`) und **pnpm 10**.

```bash
pnpm install

# Core Playground (Port 3000)
pnpm dev:core

# reddit-comments App (Port 3001)
pnpm dev:app

# Typecheck über alle Packages
pnpm typecheck
```

## Struktur

```
maui-monorepo/
├── packages/
│   └── core/                  # Nuxt Layer: Fundament
│       ├── app/               # Components, Composables, Stores, …
│       └── .playground/       # isolierte Dev-Umgebung (Port 3000)
├── apps/
│   └── reddit-comments/       # dünne App: extends [core] (Port 3001)
├── docs/
│   ├── CONCEPT.md             # Architektur-Konzept (v2)
│   └── GOALS.md               # Phasen-Roadmap mit /goal-Texten
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
| 6–9 | Utilities · i18n · Testing · CI/Deploy | 🔜 |
| 10–11 | `packages/comments` Feature Layer + Reddit Comment App | 🔜 |

Details und Nachweis-Kriterien pro Phase: [docs/GOALS.md](docs/GOALS.md)

## Konventionen

- [Conventional Commits](https://www.conventionalcommits.org) · Breaking Changes im Core mit `BREAKING CHANGE(core):` Prefix und eigenem Commit
- Branches: `main` / `dev` / `feature/*` / `fix/*`
- Im Layer nur relative Pfade (kein `~/` oder `@/`) · Domain-Types in `shared/types/`
- CRUD nur über `server/api/*` — das Web SDK macht im Browser ausschließlich Realtime
