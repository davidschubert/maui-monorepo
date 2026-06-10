# Maui Monorepo – Claude Code Context

## Projekt
Nuxt 4 Monorepo (maui-monorepo) mit zentralem Core Layer + Feature Layers.
Vollständiges Konzept: docs/CONCEPT.md

## Stack
- Nuxt 4.4.x (Composition API, SSR), Nuxt UI 4.8.x, Pinia, Tailwind CSS 4
- node-appwrite (Server SDK) + appwrite (Web SDK, NUR Realtime) — Appwrite self-hosted 1.9.0
- Zod, @nuxtjs/i18n (de+en), TypeScript strict, pnpm Workspaces, Node 22

## Architektur (3 Ebenen)
- packages/core → Fundament-Layer. Besitzt KEINE Appwrite Tables.
- packages/* → Feature Layers (themes, comments, admin, billing) — eigenes
  Datenmodell und/oder eigene UI-Welt
- apps/* → dünne Apps, komponieren via extends: [features..., core]
  (früher gelistet = höhere Priorität; App überschreibt alles)

## Appwrite (SSR-first, TablesDB)
- Terminologie: TablesDB / Tables / Rows (NICHT Databases/Collections/Documents)
- Zwei Server-Clients: createAdminClient (API Key, Resource-based mit minimalen
  Scopes) + createSessionClient (pro Request, NIE teilen!) in server/lib/appwrite.ts
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
