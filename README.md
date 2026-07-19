# 🏝️ Maui Monorepo

Nuxt 4 Monorepo mit zentralem **Core Layer** und komponierbaren **Feature Layers** — die gemeinsame Basis für alle Maui-Projekte. Auth, Appwrite-Integration, Design-Fundament und Utilities werden einmal implementiert und per `extends` in beliebig viele Apps eingebunden.

> Vollständiges Konzept: [docs/CONCEPT.md](docs/CONCEPT.md) · Phasen-Roadmap: [docs/GOALS.md](docs/GOALS.md)

## Architektur — drei Ebenen

```
packages/core            ← Ebene 1: Fundament (besitzt KEINE Appwrite Tables!)
packages/system          ← Fundament: Infra-Tabellen (audit_logs, app_config, notifications)
packages/*               ← Ebene 2: Feature Layers (themes, comments, posts, events, activity, feedback, billing, courses, tickets, moderation, admin)
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
NUXT_PUBLIC_APPWRITE_PROJECT_ID="reddit-comments"   # F6: Projekt-ID der Dev-Instanz bleibt historisch
NUXT_PUBLIC_APPWRITE_DATABASE_ID="main"
NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET="avatars"
NUXT_APPWRITE_KEY="<dein-api-key>"            # server-only, alle Scopes
NUXT_APPWRITE_MIGRATIONS_KEY="<dein-api-key>" # für Migrationen (kann derselbe sein)
```

**3. Bootstrap** — legt Datenbank + Avatars-Bucket + Web-Platform an und fährt **alle Migrationen** in Reihenfolge (system→comments→moderation→admin):
```bash
pnpm --filter comments bootstrap          # frische Instanz aufsetzen
pnpm --filter comments bootstrap --seed   # + Demo-User & -Kommentare
```
> ⚠️ Primär für **frische** Instanzen: ein Sicherheits-Guard bricht ab, wenn die `comments`-Tabelle schon Daten hat. `comments-002` ist inzwischen idempotent (droppt nicht mehr, wenn das Zielschema schon steht) — der Erst-Umbau vom alten `postId`-Schema baut das Schema aber weiterhin destruktiv neu auf. `--force` überschreibt den Guard.

**4. Starten**:
```bash
pnpm dev:app     # comments App (Port 3001)
pnpm dev:core    # Core Playground (Port 3000)
pnpm typecheck   # Typecheck über die Apps (deckt alle Layer transitiv)
```

Demo-Login (nach `--seed`): `uma@demo.local` / `Demo-Passw0rd!` (regulär), `mod@demo.local` (Moderator), `admin@demo.local` (Admin) — Passwort jeweils `Demo-Passw0rd!`.

### Skripte

| Befehl | Wirkung |
|---|---|
| `pnpm --filter comments bootstrap [--seed]` | Frische Instanz: DB + Bucket + Platform + alle Migrationen (optional Seed) |
| `pnpm --filter comments seed [--force]` | Demo-User (Rollen) + Kommentare (idempotent; `--force` re-seedet) |
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
│   ├── posts/                 # Feature Layer: Community-Feed (Posts, Polls, Fragen)
│   ├── events/                # Feature Layer: Event-Kalender (RSVP, ICS, Live-Teilnehmerzahl)
│   ├── activity/              # Feature Layer: Activity-Feed (UI zum Core-Vertrag recordActivity)
│   ├── feedback/              # Feature Layer: Feedback-Widget (Button unten links, Admin-Sichtung)
│   ├── billing/               # Feature Layer: Stripe-Abos (Checkout, Webhook, Entitlements, Portal)
│   ├── courses/               # Feature Layer: Async Course Builder / LMS (Lektionen, Fortschritt, paid via billing)
│   ├── tickets/               # Feature Layer: Ticket-Board (Trello-Kanban für Betreiber, md-Export für Claude Code)
│   ├── moderation/            # Fundament-Layer: generisches Melde-/Report-System (reports-Table)
│   ├── admin/                 # Feature Layer: Dashboard, Moderation-Queue, Changelog, Audit, …
│   └── themes/                # Feature Layer: Theming
├── apps/
│   ├── _template/             # Kopiervorlage für neue Apps (Port 3002, README mit Schritten)
│   └── comments/       # dünne App: extends [themes, admin, comments, posts, events, feedback, billing, courses, tickets, activity, moderation, core, system] (Port 3001)
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

Ports: Core Playground **3000** · comments **3001** · weitere Apps 3002+

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
| 37 | Theme-Studio (/dashboard/themes): Galerie mit Live-Wechsel + Nuxt-UI-Showcase, eigene Themes (Ramp-Generator, WCAG-Kontrast-Check, CSS-Export, Reihenfolge) — Table `custom_themes`, SSR-flash-frei | ✅ 2026-07-02 |
| 38 | Theme-Studio-Ausbau: OKLCH-Generator (Anker/Hue/Sättigung/Radius, Live-Draft), Built-in-Verwaltung + Instanz-Default, Presets + Varianten, visuelle Regressionstests je Theme; Stats-Contributor-Registry + Kleinkram | ✅ 2026-07-02 |
| 39 | Themes v2 Phase A ([Konzept](docs/THEMES-CONCEPT-V2.md)): Studio-Editor als Vollseite (Dock: 3 Entscheidungen + EIN „Erweitert"), Zufallsfarbe (OKLCH), 3 Preview-Szenen (Komponenten/Dashboard/Content, geteilt mit Galerie), L/C/H-Kurven-Graphen, Unsaved-Guard | ✅ 2026-07-03 |
| 40 | Themes v2 Phase B: Tinted Neutral (brand-getönte Flächen, EIN Schalter, `data-neutral='c-<id>'`), 5 kuratierte Schriftpaare (`data-font`, @nuxt/fonts self-hosted), Dark-Stufe (`darkAlias` 300/400/500) — config additiv erweitert, kein Schema-Bruch | ✅ 2026-07-04 |
| 41 | Individuelle Schriftarten (WOFF2-only): Table `custom_fonts` + Bucket `fonts` (Migration 012), Admin-CRUD mit Magic-Bytes-Check, Verwaltungsseite (/dashboard/themes/fonts, Vorschau in echter Schrift, Variable Fonts), Runtime-@font-face im SSR-Head, Editor-Dropdown „Eigene" (`cf-<id>`); Admin-Nav-Unterpunkte via Registry-`children` | ✅ 2026-07-04 |
| 42 | Themes v2 Phase C (Kür): Theme-JSON-Export/-Import (Instanz-Transfer), Charts-Szene (Ramp als Datenpalette, Farben rein aus CSS-Variablen); Visual-Baselines der Startseite neu erzeugt (9/9 grün) | ✅ 2026-07-04 |
| 43 | Typografie-Rollen: Text-/Überschriften-Schrift getrennt wählbar (Einzelfamilien-Registry statt Paare, Legacy-Mapping, `data-font-heading`), Überschriften-Feintuning (Gewicht/Laufweite/Großbuchstaben, unlayered schlägt Utilities), Dock in Farben-/Schriften-Boxen; Draft-Vorschau: Entwurf = volle Wahrheit, Verlassen wendet Live-Theme-Zustand an | ✅ 2026-07-04 |
| 44 | fix(comments): verwaiste Antworten (Selbst-Roots aus 005-Backfill) repariert — Migration 006 befördert zu Top-Level, 005 gehärtet, Store-Guard gegen total>rows („Alle laden"-Button klickte ins Leere) | ✅ 2026-07-04 |
| 45 | Live-Theme-Propagation: custom_themes/custom_fonts Table-read(any) (Migration 013) + realtime-themes-Plugin — offene Fenster (auch Gäste) morphen Farben/Schriften ohne Reload (E2E verifiziert) | ✅ 2026-07-04 |
| 46 | Read-only-Gesamtaudit (9 Slices, Scout→Worker-Subagenten, [AUDIT.md](AUDIT.md)): **0 Critical/High**, Reconciliation ohne „Regressed" — Abarbeitung in 4 Paketen: GDPR-Garantie-Fixes (M1/L1), Hide-Phase-2 beobachtbar (L2), CSS-Sink-Härtung + 7 Injection-Tests (L3), Kleinkram-Batch (L4–L14), CONCEPT.md-Doku-Drift (A4/A14/Tabellen) nachgezogen | ✅ 2026-07-05 |
| 47 | **Roadmap v3 · GOALS-Phase 21: Activity Feed** — Core-Vertrag `recordActivity()` (+ Capability `feed.manage`), system-Migration 014 + GDPR-Contributor, `packages/feed` (Cursor-Feed, Realtime live über die geteilte JWT-SDK-WS, `/feed` + `/dashboard/feed` via Admin-Registry), comments als erste Quelle (`comment.created`) — Browser-verifiziert inkl. RBAC/GDPR/i18n | ✅ 2026-07-06 |
| 48 | **Feed-Ausbau**: 9 Ereignis-Typen (`user.joined` inkl. OTP-Erst-Verify, `changelog/theme/font`-Publish-Events, `theme.deleted/default_changed`, Meilensteine mit System-Actor 🎉), Gruppierung konsekutiver Einträge, Infinite Scroll; Trennlinie geschärft: Security-/Profil-Signale (`password_changed`, `recovery_requested`, `profile_updated`) gehen ins **Audit-Log** (pseudonymisiert statt hard-deleted), nie in den Community-Feed | ✅ 2026-07-06 |
| 49 | **Roadmap v3 · GOALS-Phase 25: `packages/posts`** — Community-Feed (Posts, Multiple-Choice-Polls mit verdeckten Ergebnissen bis zur eigenen Stimme, offene Fragen, Scheduled Questions via publish-on-read ohne Cron), member-led mit Rate-Limit + `posts.moderate` (zweiphasiges Hide) + generischem Report-Vertrag; Kommentare = comments-Layer via `#comments`-Slot (A14-App-Komposition); Markdown-Sink in den Core gehoben (`MarkdownContent`); `/community` + `dashboard/posts` — Browser-verifiziert inkl. Realtime-Pille, GDPR-Tombstone, XSS | ✅ 2026-07-07 |
| 50 | **Roadmap v3 · GOALS-Phase 22: `packages/events`** — Event-Kalender (Liste kommend/Archiv + Detailseite, bewusst ohne Monats-Grid/Recurring), RSVP going/maybe/declined mit Toggle und server-autoritativem `attendeeCount` (atomare Increments, `max=capacity` gegen Überbuchung im Race), ICS-Export als pure Funktion, Soft-Cancel; Capability `events.manage` + `useViewingPresence` in den Core gehoben; `recordActivity` event.published/event.rsvp; Kommentare via `#comments`-Slot (A14-App-Komposition); GDPR-Contributor — Browser-verifiziert inkl. Realtime-Zählersprung, Kapazitäts-409, i18n | ✅ 2026-07-07 |
| 51 | **GOALS-Phase 26: Events v2 Teil A** ([Plan](docs/plans/EVENTS-V2.md), Circle.so als Leitplanke): Cover-Upload (Bucket `event-covers`, Magic-Bytes) + Landing Page (Countdown-Pill, Host-Avatar, Avatar-Stack, Knappheits-Label, Share), Monats-Gruppierung + Kalender-Monatsansicht (mehrtägig = Pill je Tag), Ortstyp online/vor Ort mit Provider-Erkennung (Meet/Jitsi/Twitch/YouTube/OwnCast/LinkedIn Live), „Join live" T−15 min nur für Zusager, Replays (`replayUrl` + Feed-Announce) — Embed bewusst AUS (nur externe Links) | ✅ 2026-07-07 |
| 52 | **Events-Feinschliff nach Review** (Meetup.com als Leitplanke, [Plan §7b](docs/plans/EVENTS-V2.md)): vertikale Card im Grid (Datums-**Spanne** + „Mehrtägig"-Badge, Online/Vor-Ort, „Kostenlos"-Badge), Detailseite zweispaltig mit Zurück-Link + sticky Info-Karte, Beschreibung als Markdown (Listen/fett, ContentClamp „Mehr/Weniger"), Adresse → Google-Maps-Link „So findest du uns" + Anfahrtshinweise, Up-/Downvotes (`event_votes`, Migration 003), Teilnehmerliste mit Namen **nur eingeloggt** (Gäste: Anzahl + Blur), Titel-Suche (Fulltext), Melden via moderation-Vertrag (`targetType 'event'`); Kategorien bewusst abgelehnt | ✅ 2026-07-07 |
| 53 | **GOALS-Phase 27: Events v2 Teil B** — Reminder ohne Cron (on-read-Sweep 24 h vor Start → `notify()` an Zusager, Bell-Typ `reminder`, idempotent über `remindersSentAt`; `POST /api/events/reminder-sweep` als scheduled-Function-Andockpunkt, key-geschützt) + **Paid Events vollständig vorbereitet**: `event_tickets` im Endschema, Vertrag `registerEventTicketGuard`/`grantEventTicket` (fail-closed 403, App-Guard = Ticket-Check verdrahtet), Preis-Badge + „Ticket kaufen (bald verfügbar)", Admin-Access-Toggle — Phase 23 verbindet nur noch Checkout + Webhook ([Andockpunkt](docs/plans/BILLING-STRIPE.md)) | ✅ 2026-07-08 |
| 54 | **Events-Filter-Paket** ([Plan §7c](docs/plans/EVENTS-V2.md)): Zeit-Chips Heute/Morgen/Wochenende (lokale Fenster über die Range-Query) neben Kommende/Archiv; persönliche Filter **Zugesagt/Geliked/Teilgenommen** (`?mine=`, nur eingeloggt — „Teilgenommen" = nur MEINE besuchten Events, anders als das Archiv); Share-Button auf der Card | ✅ 2026-07-08 |
| 55 | **Events: Zweispalten-Layout** ([Plan §7d](docs/plans/EVENTS-V2.md)): Ansicht-Switch entfernt — links gefilterte Liste, rechts dauerhaft der sticky Monats-Kalender; **Card-Hover highlightet die Kalender-Pills des Events** (mehrtägig = alle Tage); Filter/Suche steuern bewusst nur die Liste | ✅ 2026-07-08 |
| 56 | **Feedback-Widget + GOALS-Phase 23: `packages/billing` (Stripe)** — Feedback-Button unten links (Popup, Gäste + Rate-Limit, Admin-Sichtung, `feedback.manage`); Billing komplett implementiert (hosted Checkout/Portal, Webhook mit Signatur/Allowlist/Stale-Guard, Entitlements + `useBilling` mit Realtime, Pricing/Account/Admin-UI, GDPR) inkl. **Events-Ticket-Verbindung** (`registerCheckoutFulfillment` → `grantEventTicket`, Kauf-CTA aktiv) — lokal voll bewiesen (Tampering 400, Signatur 400, Row-Security, simulierte Subscription → entitled); Live-Matrix mit echtem Test-Key gefahren: echter Checkout, echtes Abo -> Webhook -> Realtime-Sprung auf Kuendigungs-Anzeige, Idempotenz per events resend | ✅ 2026-07-08 |
| 57 | **GOALS-Phase 24: `packages/courses` (LMS v1)** — Markdown-Lektionen (Core-Sink, XSS-sicher), Enrollment + Fortschritt mit server-autoritativem Abschluss, Kurs-Galerie/Übersicht/LessonView (Prev/Next, Fortschrittsbalken, `#comments`-Slot), Builder mit Lektionen-CRUD/Reorder/Edit-Awareness (`useEditAwareness` → Core); Zugang free/members/**paid** über `registerCourseAccessGuard` — die App verdrahtet **echte Billing-Entitlements** (bewiesen: Free-User 403, Pro-Abo 201); `recordActivity` course.published/completed; GDPR | ✅ 2026-07-08 |
| 58 | **`packages/tickets` — Ticket-Board P1** ([Plan](docs/plans/TICKETS-BOARD.md)): Trello-artiges Kanban als eigener Layer (`/dashboard/tickets`, Capability `tickets.manage` für Admins+Mods) — Listen (anlegen/umbenennen/kopieren/sortieren/löschen, Karten-Zähler), Karten mit nativem DnD (Karten + Listen), Detail-Modal (Label/Priorität/Aufwand, Start/Fällig, Markdown-Beschreibung, Checkliste, Mitglieder, Deep-Link-Share), **„Für Claude Code kopieren"** (md-Export + Download), Realtime über die geteilte JWT-WS, GDPR-Contributor; Admin-Roadmap abgelöst (Planungs-Wahrheit bleibt GOALS.md); **P2 ✅**: „Als Ticket übernehmen" in der Feedback-Verwaltung (App verdrahtet via `maui.feedback.ticketEndpoint`, `feedbackId`-Rückreferenz, Doppel-Übernahme 409) · **P3 ✅** KI-Triage via OpenRouter (Model per `maui.tickets.ai`, Relevanz/Prio/Aufwand/Rückfragen als Beschreibungs-Abschnitt, auto bei Übernahme — live verifiziert) · **P4 ✅** Kommentare rechts im Modal (comments-Layer, NEUER Vertrag `maui.comments.operatorTargets`: Rows nur `read(label:admin/moderator)`), Beobachten + „Beobachtet"-Slideover, Benachrichtigungen via `notify()` (Zuweisung/Move/Erledigt/Fälligkeit, on-read-Sweep), Anhänge (Bucket `ticket-files`, Magic-Bytes, Serving nur über geprüfte Routen) | ✅ 2026-07-09 |
| 59 | **Event-Serien (Recurrence)** ([Plan §7e](docs/plans/EVENTS-V2.md)): Master + **materialisierte Instanzen** (echte Event-Rows — RSVP/Kapazität/Kommentare/Votes/Reminder/ICS/Tickets funktionieren unverändert pro Termin), Regeln wöchentlich/14-täglich/monatlich (Monatsletzter geklemmt), Rolling Window 120 Tage mit on-read-Top-up, optionales Serienende; Master-Publish/-Cover propagieren auf Instanzen, danach ist jeder Termin eigenständig; „Serie beenden" sagt künftige Termine soft ab; Serien-Badge auf Karten + Kalender-Pills je Termin — live verifiziert (7 Termine, Stop, Cleanup) | ✅ 2026-07-09 |
| 60 | **KI-Paket: `aiComplete()` im Core + Moderations-Assist** — generischer KI-Completion-Client als Core-Util (`aiComplete`/`aiCompleteJson`, OpenAI-kompatible Chat-Completions-API, Gate `maui.ai` + server-only `NUXT_AI_KEY`; Policy bleibt beim Konsumenten); Ticket-Triage darauf refactored (Transport raus aus `ticketTriage.ts`, `maui.tickets.ai` fällt feldweise auf `maui.ai` zurück, Key `NUXT_TICKETS_AI_KEY` vor `NUXT_AI_KEY`); **Moderations-Assist** (advisory): `POST /api/admin/comments/:id/assist` holt Zweitmeinung zu gemeldeten Kommentaren (Inhalt lädt admin, Meldegründe über NEUEN moderation-Vertrag `openReportsForTarget` — A14), Empfehlung hide/dismiss + Schwere 1–5 + Begründung als Alert in der Queue; Button nur bei `aiAssist=true` (Gate an + Key da), KI ändert NIE selbst — der Moderator entscheidet. **Ausbau (gleicher Tag):** in comments aktiviert + live bewiesen (toxisch → hide/Schwere 4, sachliche Kritik → dismiss/Schwere 1, least-privileged Moderator; UI-Klick verifiziert); Assist auch für gemeldete **Posts** (`POST /api/posts/:id/assist`, Poll-Optionen im Prompt, RBAC-Negativtest moderator → 403); globales Laufzeit-Model-Override **`app_config.aiModel`** (Migration system-016, Eingabefeld auf der Admin-Config-Seite, Kette `ticketsAiModel` > `aiModel` > `maui.tickets.ai` > `maui.ai` — live mit fremdem Modell bewiesen, UI-Save/Reset geprüft) | ✅ 2026-07-09 |
| 61 | **Embed-Widget E0+E1 — Read-only-MVP** ([Plan](docs/plans/EMBED-WIDGET.md), [Integrations-Doku](docs/EMBED.md)): Drittseiten binden Kommentare per `<script src=".../embed.js">` ein (iframe, Disqus-Modell). **E0-Sicherheits-Vorarbeiten:** Read-Rate-Limit auf `GET /api/comments` (120/min/IP, 429 im Store still), `frame-ancestors 'self'` auf ALLEN Seiten via core-Registry `registerEmbeddableRoute` (expliziter Vertrag — comments registriert `/embed` aus `maui.comments.embed.allowedOrigins`), CSRF-Origin-Check-Middleware (Gate `maui.security.csrfOriginCheck`, Pflicht ab E2). **E1:** `/embed`-Seite (Zod-Params, noindex, transparent nur bei `theme=auto`, Resize-postMessage mit striktem targetOrigin) + dependency-freier Vanilla-Loader `embed.js` (sandbox, Origin+Source-Check, mehrere Widgets/Seite) + Testseite + Playwright-Smoke (eigener Host-Server pro Worker). Live bewiesen: Widget auf Fremd-Port-Seite, Kommentar erscheint per Realtime-Pille im iframe, Resize wächst mit, dark/primary-Params greifen, Burst → 429. **E2 (Schreiben im iframe via Login-Popup + CHIPS) bewusst offen** — braucht echte Cross-Site-Domains zum seriösen Verifizieren | ✅ 2026-07-09 |
| 62 | **Auto-Hide-Threshold** (OPEN-ITEMS Idee 5, Embed-Plan § 3f): NEUER moderation-Vertrag `registerReportEscalationHandler` (A14: moderation zählt, Konsequenz gehört dem Target-Owner) — comments blendet ab `maui.comments.autoHideReports` offenen Meldungen (Default 0 = aus; comments: 3) automatisch zweiphasig + mit Cascade aus, Meldungen bleiben offen für die finale Moderations-Entscheidung. Dafür Zweiphasen-Hide/Cascade aus admin/status.patch zum Table-Owner gehoben (`commentModeration.ts`). Live bewiesen: 3. Meldung → Parent+Antwort weg, Roh-REST 404, Queue zeigt hidden+3, Restore öffnet wieder | ✅ 2026-07-09 |
| 63 | **E-Mail-Notifications + täglicher Digest** (OPEN-ITEMS Idee 1): Bell-Notifications optional per Mail — Opt-in unter Settings → Benachrichtigungen (`off`/`instant`/`digest`, Default aus; Mail-Sprache = UI-Sprache beim Speichern). Core-SMTP-Mailer via nodemailer (`NUXT_SMTP_*`, leerer Host = aus — lokal Mailpit); `notify()` schickt den Instant-Zweig best-effort; **Digest-Sweep** holt Kandidaten aus den ungelesenen `notifications`-Rows (kein User-Scan), max. 1 Sammel-Mail/Tag mit NEUEN Einträgen seit `prefs.emailDigestLastAt`, 30-min-Intervall-Plugin + Ops-Route `POST /api/notifications/run-digest` (system.manage). Live via Mailpit bewiesen: Instant-Mail (de) mit Typ-Label/Snippet/Link-Guard/Abmelde-Footer, Digest-Sammel-Mail, Zweitlauf übersprungen, Nicht-Opt-ins unangetastet; Settings-UI mit Save/Reload-Persistenz | ✅ 2026-07-10 |
| 64 | **Ideen-Batch 2–4**: (a) **Admin-Bulk + CSV** — Multi-Select in Moderations-Queue (bulk hide/dismiss/restore, `POST /api/admin/comments/bulk`, Cascade + Reports-Lifecycle wie Einzel-Flow) und User-Liste (bulk block/unblock mit Self-/Last-Admin-Guard) + CSV-Export aller Accounts (Cursor, BOM, Formel-Injection-Guard, Audit); moderation-Vertrag `resolveReportsForTarget` extrahiert. Live per API+UI bewiesen (RBAC 403, Login-Sperre, Badges). (b) **Microcaching** — core `createMicrocache`; Gast-Kommentare Seite 1 (10s, eingeloggt ungecacht), öffentliche Changelog-Liste (Write-Invalidierung), `/api/stats` (60s, Audit L11); bewusst KEIN SSR-Seiten-Cache (Session-State im HTML). TTL/Bypass live bewiesen, Zweitcalls ~8× schneller. (c) **CI mit echter Appwrite** — Workflow `e2e.yml`: geschnittener 1.9.5-Stack (ci/appwrite), `scripts/ci/appwrite-setup.mjs` skriptet Console (Account→Projekt→Key→Platform→.env), bootstrap+seed+Changelog-Seed, volle Playwright-Suite — **Realtime-E2E läuft erstmals in CI**; Lauf grün (14 passed) | ✅ 2026-07-10 |
| 65 | **Baselines + hreflang**: (a) **Themes-Visual-Regression drift-fest** — neue deterministische `/visual`-Seite (Nachfolger /styleguide: Landing-Bausteine + Komponenten-Zoo, feste Werte, leerer Kommentar-Thread, noindex) als Screenshot-Ziel; Baselines neu, Immunität bewiesen (neuer Demo-Kommentar → 9/9 grün — vorher riss jede Datenänderung alle Baselines). (b) **SEO-Zweisprachigkeit** (redirectOn-'all'-Caveat gelöst): `useLocaleHead` in beiden App-Shells → hreflang-Alternates (x-default/de/en) + og:locale + canonical auf jeder Seite (absolute URLs via `NUXT_PUBLIC_I18N_BASE_URL`); `detectBrowserLanguage.fallbackLocale` entfernt — signal-lose Requests (Crawler) bekamen sonst auf `/de/*` EN-Content/-canonical, jetzt ist die URL-Locale Autorität; Redirect-Matrix (Cookie, Accept-Language, Deep-Links) live geprüft, Smoke/Auth/Embed 13/13 | ✅ 2026-07-10 |
| 66 | **Prod-Generalprobe + Generator-Vorarbeit + Kosmetik**: (a) **Production-Build lokal bewiesen** (Phase-17-Risikoabbau) — `nuxi build` + node .output auf 3002: Boot sauber, CSP/hreflang/noindex korrekt, Microcaches aktiv, **14/14 funktionale E2E gegen den Prod-Build** (Smoke/Auth/Embed/Realtime; 1 Context-Setup-Flake im Re-Run grün). (b) **Themes-Katalog-Generator** (Vollausbau Schritt 3 als Vorarbeit, ohne E1–E7 anzutasten): `shared/themeGen.ts` + `theme.catalog.ts` (Platzhalter = 9 Bestands-Themes) + `pnpm --filter @maui/themes generate` → `.generated/`-Vorschau; Kontrast-Gate ≥3:1 mit Stufen-Shift, Determinismus byte-gleich bewiesen, 8 Tests; `--write` wartet auf visuelle Abnahme. (c) **PresenceAvatar auf UChip** (geparkter Kosmetik-Punkt) — Badge aus dem Chip-Theme, live mit Typing-Presence verifiziert. (d) CLAUDE.md/CONCEPT um alle neuen Core-Verträge nachgezogen | ✅ 2026-07-11 |
| 67 | **Multi-Site-Plattform: Strategie + Gate S0 + M1 Feature-Manifeste**: (a) **Plattform-Strategie** ([docs/plans/MULTI-SITE-PLATFORM-STRATEGIE.md](docs/plans/MULTI-SITE-PLATFORM-STRATEGIE.md)) in 7 Review-Runden abgestimmt und freigegeben — drei Horizonte (eigene Sites → Agentur → SaaS), Control Plane hawaii.studio (Hybrid-Dashboard), Appwrite-**Projekt pro Site** auf geteiltem Server, zwei Site-Klassen, Feature-System F1–F7, Lücken L1–L8, Spikes S0–S4 als Decision Gates. (b) **Gate S0 bestanden** ([spikes/s0-multi-project](spikes/s0-multi-project/README.md), 12/12 Tests gegen echte Wegwerf-Appwrite): Host-Auflösung ohne Default-Fallback, Kontext ohne Runtime-Key, Session-/JWT-Projektbindung, Cross-Site-Isolation; Learnings: keyId global eindeutig, Login = System-Op, 401-Mapping. (c) **M1 umgesetzt**: `feature.manifest.ts` in allen 13 Layern + `site.manifest.ts` pro App (Single Source der Feature-Wahl) + `pnpm check:manifests` (CI/lint) — erzwingt Konsistenz von extends/package.json, requires-Schluss (comments/posts→moderation) und LAYER_ORDER-Drift; 4 Negativproben demonstriert | ✅ 2026-07-14 |

Details und Nachweis-Kriterien pro Phase: [docs/GOALS.md](docs/GOALS.md) · Upgrade-Plan: [docs/APPWRITE-1.9.5-UPGRADE.md](docs/APPWRITE-1.9.5-UPGRADE.md) · Offene Punkte: [docs/OPEN-ITEMS.md](docs/OPEN-ITEMS.md)
| 68 | **M2: Laufzeit-Feature-Gates + Feature-Katalog** — (a) **Layer-Rename feed → activity** (Verwechslung mit Community-Feed; F6: ein Begriff durch alle Ebenen — Ordner, @maui/activity, /api/activity, /activity, Capability activity.manage, i18n). (b) **F2 verallgemeinert**: registerFeatureManifest-Registry (13 Nitro-Plugins), `app_config.features` (system-018) + `getEffectiveFeatures`/`requireFeature`, zentrale feature-gate-Middleware (apiPrefixes → 404), `useFeature()` reaktiv über den Realtime-Config-Kanal. (c) **Feature-Seite** /dashboard/admin/features (Karten aus Manifesten, Grundgerüst nicht schaltbar, requires-Guards 409, Audit). Live bewiesen: Toggle aus → API 404 + Nav-Icon verschwindet OHNE Reload; an → alles zurück. Dazu: Moderations-Hide räumt Activity-Einträge auf (Inhalts-Leak-Fix, system-017, live bewiesen) | ✅ 2026-07-14 |
| 69 | **M3: Migrations-Audit „additiv-sicher"** — alle 44 Migrationen in 3 parallelen Audit-Läufen klassifiziert: 43 additiv-sicher, **1 Fix (comments-002)**: DROP-Guard war per UND gekoppelt (halbes Zielschema hätte die gesunde befüllte Table mitgerissen) → jetzt DROP nur bei positiv erkanntem Alt-Schema (postId/text), comment_votes nur im Verbund, unvollständiges Ziel wird additiv repariert. Dauerhaft: `check:manifests` verlangt `destruktiv-ok:`-Marker für zerstörerische Migration-Aufrufe (Negativprobe rot). Abnahme: voller Re-Run auf befüllter Instanz grün, Datenbestand identisch — **Nach-Aktivierung per `pnpm migrate --layer` freigegeben (F4.8)**. Details: [docs/plans/M3-MIGRATIONS-AUDIT.md](docs/plans/M3-MIGRATIONS-AUDIT.md) | ✅ 2026-07-14 |
| 70 | **M4: `pnpm create-site` + Gate G1** — neue Studio-Site in EINEM Befehl: Scaffold aus _template (generierte package.json/nuxt.config/site.manifest, Port automatisch), requires-validierte Feature-Wahl, Appwrite-Provisionierung per Console-REST (Projekt `<name>-<shortid>` nach F6, global eindeutige Key-IDs, Platform, .env), Bootstrap mit **manifest-gefilterten Migrationen** (Site ohne courses bekommt keine courses-Tables), check:manifests als Schlussgate. **Gate G1/S1 läuft dauerhaft in der CI** (e2e.yml provisioniert bei jedem Push ein Projekt auf der echten Wegwerf-Appwrite). Provisioner-Learnings dokumentiert (408-Poll; halb initialisierte Projekte) | ✅ 2026-07-14 |
| 71 | **M5/P2 `apps/photos` + Gate G2** — maui.photos als Klasse-A-Site (media-Layer, eigenes Appwrite-Projekt `photos-qgry`, Port 3003); **Gate G2 bestanden** ([spikes/s3-minimal](spikes/s3-minimal/README.md)): Minimal-S3 im Browser (2 Projekte, parallele Sessions, Realtime-Isolation mit Kreuz-Check), S2-API-Oberfläche self-hosted verifiziert. Nachtrag 2026-07-16: JWT-Realtime-Befund **aufgeklärt** — Appwrite 1.9.5 liest `&jwt=` am Realtime-Endpoint nicht (Prod-Muster trägt das same-site Session-Cookie); Cookie-freier Pfad per `subscribe`→`authentication`-Message verifiziert, Klasse-B-Entscheidung in G3 | ✅ 2026-07-15 |
| 72 | **M6-T1: Control Plane `apps/studio` — Sites-Register + Health** — studio-Layer (Table `sites`, CRUD + Health-Check `sites.manage`), App auf Port 3004 (Projekt `studio-1xsl`, per Console-REST provisioniert wie create-site). Register + Health **browser-verifiziert**: photos (`photos-qgry`) + comments registriert, Health-Check beide „ok" (Appwrite `/health/version` + App-URL-Probe). create-site-Fix: Platform-IDs global eindeutig (`web-<site>-localhost`) — 409 hieß „Platform in FREMDEM Projekt", das eigene blieb ohne | ✅ 2026-07-16 |
| 73 | **M6-T2: Site-Erstellungs-Flow — create-site als Job hinter der UI** (Vorstufe Provisioner-Vertrag § 8): Tables `provisioning_jobs` + `feature_catalog` (studio-002), typisierter Job-Vertrag (queued→running→done/error), POST /api/studio/jobs mit Katalog-Frühvalidierung (requires-Schluss, Duplikate). Runner `pnpm studio:jobs [--watch]` synct den Feature-Katalog aus den Manifesten und führt Jobs repo-seitig aus (Console-Creds NUR beim Runner, nie im Web-Prozess). UI: „Neue Site"-Dialog mit Feature-Picker (Katalog-Texte aus Manifesten, requires-Autoselect) + Job-Liste mit Log. **E2E-verifiziert** (Probe-Site per UI → Runner → Projekt+Register, danach rückstandsfrei entfernt) | ✅ 2026-07-16 |
| 74 | **M6-T3: Manuelle Entitlements (F3-Vorstufe)** — Table `entitlements` (studio-003, Row pro Site×Feature, siteProjectId = F6-Identität), PUT /api/studio/sites/:id/entitlements ersetzt das Grant-Set (Katalog-validiert), Runner-Auto-Grant für frisch provisionierte Sites, Feature-Chips + Verwalten-Modal im Register (requires-Autoselect). Bewusst ohne Signatur/Stripe — Zustellung an die Sites folgt in M8, der `featureGates.ts`-Andockpunkt bleibt vorbereitet. Betriebs-Learning: Appwrite prüft das MariaDB-Zeilenbudget VOR dem 409-Duplikat-Check → studio-002 idempotent per listColumns-Inspektion, `log` auf 8000 geschrumpft | ✅ 2026-07-16 |
| 75 | **M6-T4: Health-Automatik + Feature-Snapshot → M6 (Control Plane MVP) KOMPLETT** — Intervall-Plugin nach Digest-Sweep-Muster (5 min + Erst-Lauf, Logik geteilt mit der manuellen Route in `siteHealth.ts`); neue öffentliche Core-Route `GET /api/platform/features` (nur wirksam aktive Keys, Microcache 60 s — § 8: Studio hält keine Site-Keys), Sweep persistiert den Snapshot in `sites.features` (studio-004). UI: „Läuft:"-Chips je Site, **Warn-Chip wenn ein Feature ohne Entitlement läuft** — browser-verifiziert (photos deckungsgleich, comments mit Mismatch-Warnungen) | ✅ 2026-07-17 |
| 76 | **M5/P2-Polish photos → P2 KOMPLETT** — Kontakt-Formular server-seitig (POST /api/contact: zod + Honeypot + eigener Rate-Limit, Versand über Core-Mailer, 503-Fallback auf mailto; **Mailpit-verifiziert**); Cormorant Garamond self-hosted via @nuxt/fonts (Google-Link raus, /_fonts-Beweis im Browser); photos.css auf `body.photos-site` gescopet (Vars auf body statt :root) — Login/Dashboard wieder im Plattform-Standard-Look | ✅ 2026-07-17 |
| 77 | **M8-Vorbereitung: signierte Entitlement-Zustellung (F3)** — Ed25519-Dokument (kid-Rotation, Clock-Skew ±5 min, validUntil/graceUntil/suspended; 20 Unit-Tests), Studio stellt aus (`GET /api/platform/entitlements/:projectId`, Keys via `pnpm entitlements:keygen`), Sites pullen (15-min-Plugin + system.manage-Refresh), nur verifizierte Dokumente landen in `app_config.entitlements` (system-019). **featureGates = Registry ∧ Laufzeit-Gate ∧ Entitlement** (kein Dokument = neutral; gefälschtes = optional-Tier AUS). **E2E-Beweis:** media-Grant für photos entzogen → `/api/media` 404, Re-Grant → 200. M8 muss nur noch Stripe/Workspaces anschließen | ✅ 2026-07-17 |
| 78 | **M5/P3 `apps/portfolio` (→ M5 KOMPLETT) + autonomer Block + Go-Live-Generalprobe** — portfolio als Dogfooding über den Studio-Job-Flow (portfolio-g4ml, Port 3005; Landing + Cases, Syne/Glibbergrün); L6-Alerting (Health-Sweep mailt Statuswechsel), Dashboard-Nav blendet deaktivierte Features live aus (`isFeatureStateEnabled` als das EINE Gate-Prädikat); PHASE-17-Ops-Paket (deploy.yml scharf mit No-op-Guard, realtime-watchdog.sh mit 101-Handshake-Beweis, appwrite-backup.sh mit Restore-Probe 855 Tabellen); G3-Recherche (Appwrite main hat den Realtime-jwt-Fallback, noch keine Release); Generalprobe: Prod-Builds aller 4 Apps + comments-Prod-Boot auf dem ploi-Daemon-Pfad | ✅ 2026-07-17 |
| 79 | **PHASE-17 Teil B: Go-Live comments.pukalani.app** ([Checkliste + Learnings](docs/plans/PHASE-17-PRODUCTION.md)) — Appwrite 1.9.5 produktiv auf api.pukalani.app (gehärtete .env VOR Erststart, LE-Zert via `_APP_EMAIL_CERTIFICATES`, Console-Whitelist), ploi-Site mit pm2 + manuellem Proxy-vHost (Port 3001, corepack pnpm, NODE_OPTIONS-Heap-Fix, HSTS-Include), **Auto-Deploy-Kette e2e bewiesen** (Push → Test → Deploy-Workflow → ploi-Build → pm2-Restart; Secret via Zwischenablage, nie im Chat), Backups täglich + **offsite auf Storage Box** (BX11 `maui-backup`, rsync/SSH-Key, bewiesen), UptimeRobot (api aktiv, comments-Keyword pausiert bis Smoke), Realtime-Watchdog-Cron. Least-privilege-API-Keys + Web-Platform per Console gesetzt; „Deny disposable emails" speichert auf 1.9.5 self-hosted nicht (Console dem Server voraus). **Abschluss 2026-07-19:** Schema-Bootstrap gegen Prod (29 Tables; Learnings: Migrations-Key braucht `rows.*` für Seed-Rows/Backfills, Budget-vor-409 beim system-Re-Run → restliche Layer per `--layer` weiterfahren) + voller Smoke-Test: OTP-Mail via Resend ✓, admin-Label ✓, Kommentar ✓, Gast-Sicht per curl ✓, **Realtime ohne Reload live** ✓, Bundle ohne Key ✓ → **comments.pukalani.app ist LIVE** | ✅ 2026-07-19 |
| 80 | **M8: Workspace-Billing (Stripe)** ([Plan + Abnahme](docs/plans/M8-WORKSPACE-BILLING.md)) — Pläne free/pro/business als Code-Katalog (`maui.studio.plans`, Stripe-lookup_keys statt Env-Price-IDs), Workspaces-Verwaltung im Studio-Dashboard (Anlegen, Site-Zuordnung, „Plan ändern“ → Stripe-hosted Checkout), billing-Layer um **Abo-Lifecycle-Vertrag** `registerSubscriptionFulfillment` + `createSubscriptionCheckoutSession` erweitert (Metadata auf `subscription_data`), studio-Grant-Sync (`applyWorkspacePlan`, requires-Schluss, geteilte `replaceSiteGrants`-Logik) mit purer, 13-fach getesteter Policy; Kündigungs-Timing macht **Stripe selbst** (cancel_at_period_end → `deleted` → **free-Fallback**, nie null Features; past_due = Marker, Dunning = Grace). **Test-Mode-E2E bewiesen:** Checkout free→business (hosted Seite, 4242) → Webhook → business-Grant-Set an allen Workspace-Sites; Sofort-Kündigung → free-Fallback `[comments, moderation]`. Produkte Workspace Pro 29 €/M + Business 79 €/M in der Sandbox (Preise = Platzhalter) | ✅ 2026-07-19 |
| 81 | **M9: Workspace-Self-Service v1** ([Plan + Abnahme](docs/plans/M9-SELF-SERVICE.md)) — Owner werden echte Studio-User: `workspace_members`/`workspace_invites` (studio-007/008, DB hält nur SHA-256-Token-Hashes), Einladungs-Flow über den bestehenden Core-OTP-Login (Betreiber lädt ein, Accept bindet Membership; E-Mail-Mismatch 403, Token einmalig, localStorage-Brücke für Accept-nach-Login), Kundenbereich **`/workspace`** (Plan/Status/Sites read-only, „Plan ändern“ mit **Kunde als Stripe-Customer**, „Abrechnung verwalten“ = Stripe-Portal), Guard = Membership statt Labels (`requireWorkspaceMember`), GDPR-Contributor `studio` (löst M8-Aufschub ein). **Test-Mode-E2E als echter Kunde bewiesen:** Invite-Mail → OTP-Login → Accept → Checkout business (Customer = kunde.ohana@…) → Grant-Sync → Kündigung → free-Fallback; Betreiber-Register zeigt „Owner aktiv“ | ✅ 2026-07-19 |
| 82 | **Changelog Track 2B aktiv (A.10 #7)** — Function `changelog-draft` auf Prod deployt (node-22 via `_APP_FUNCTIONS_RUNTIMES`, CLI 22 per npx, migrations-prod-Key + Functions-Scopes), GitHub-Release-Webhook (nur Releases, HMAC) → **https://changelog.pukalani.app/** als Custom Domain mit Let's-Encrypt (functions-Subdomains bekommen auf 1.9.5 kein Einzel-Cert — Learning dokumentiert). Beweise: Ping 200, Smoke-Draft (62 Commits) angelegt+gelöscht, Negativtests 401; echter Release-E2E läuft mit dem nächsten release-please-Release. [Ist-Zustand](docs/plans/CHANGELOG-2B-AKTIVIERUNG.md) | ✅ 2026-07-19 |
| 83 | **Zero-Downtime-Deploy Stufe 2 (A.10)** — Deploys frieren `.output` als Release unter `releases/comments/<sha>/` ein, atomarer `current`-Symlink-Flip, pm2 **Cluster-Mode** ([ops/ecosystem-comments.config.cjs](ops/ecosystem-comments.config.cjs)) mit `pm2 reload` statt Restart (ploi-Auto-Restart aus); .env-Parsing in der Ecosystem-Config, `pm2 save` + Release-Pruning (5 behalten) im Deploy-Script. **Beweis: curl-Loop auf /api/health (~0,3 s Takt) über einen kompletten Deploy — 0 Nicht-200** | ✅ 2026-07-19 |
| 84 | **H2-Live: portfolio.pukalani.app + studio.pukalani.app auf Prod** — zweite+dritte ploi-Site auf app-prod (Ports 3002/3003, LE-Certs, Proxy-vHosts, ZDT-Releases + pm2-Cluster), Appwrite-Projekte `portfolio-prod`/`studio-prod` unter neuem **Provisioner-Console-Account** (Projekt-Muster „Console-Creds nur beim Runner": Keys per curl erstellt, Secrets file-to-file in die envs — nie im Chat; Classifier blockt Browser-Key-Harvesting zu Recht), `main`-DB + volle Migrationen (portfolio: system+admin; studio: 36 Tables inkl. workspaces/billing), Stripe-Prod-Webhook (6 Events, Signaturpflicht 400-bewiesen), deploy.yml als sequenzielle 3-Site-Kette (RAM-Regel: nie 2 Nuxt-Builds parallel — OOM 137). Smoke: beide Startseiten 200 SSR, /api/health ok, portfolio-Cases de/en, studio-Login. Offen: Betreiber-Account auf studio-prod (David registrieren → admin-Label), 2 ploi-Webhook-Secrets, UptimeRobot | ✅ 2026-07-19 |

## Konventionen

- [Conventional Commits](https://www.conventionalcommits.org) · Breaking Changes im Core mit `BREAKING CHANGE(core):` Prefix und eigenem Commit
- Branches: `main` / `dev` / `feature/*` / `fix/*`
- Im Layer nur relative Pfade (kein `~/` oder `@/`) · Domain-Types in `shared/types/`
- CRUD nur über `server/api/*` — das Web SDK macht im Browser ausschließlich Realtime
