# Audit — maui-monorepo

Stand: 2026-07-05 · Read-only-Gesamtaudit (9 Slices: core, system, moderation, themes, comments, admin, apps, functions, config/build) gegen die dokumentierten Invarianten (CONCEPT A1–A14, RBAC-CONCEPT, MODERATION-AND-LAYER-BOUNDARIES, THEMES-CONCEPT-V2, AUTH-FORMS, GOALS/OPEN-ITEMS, docs/plans/*). Diagnose, keine Fixes.

> **Abarbeitung (gleicher Tag, 4 Pakete):** ✅ gefixt: M1, L1–L10, L12–L14 sowie
> Doku-Drift D1–D4 (Commits `0ed5c11`, `7bff577`, `3553643`, `c3f194e`, `d2de8b1`
> + Doku-Commit). ⏸ L11 mit der Caching/ISR-Idee gebündelt (OPEN-ITEMS),
> L15 als dokumentierte Grenze akzeptiert. Offene Produktfragen aus §6
> (Presence-Scope, deleted-Totals, X-Forwarded-For→Phase 17) in OPEN-ITEMS 🟡 überführt.

---

## 1. Executive Summary

**Gesamtzustand: sehr gesund.** Über alle 9 Slices gibt es **keine Critical- und keine High-Findings**. Der Code entspricht der dokumentierten Architektur ungewöhnlich genau: Layer-Grenzen (A14) halten, RBAC-Gates sind vollständig, die Realtime-/Presence-Architektur ist wie dokumentiert umgesetzt, GDPR-Orchestrierung folgt dem Plan, der ESLint-Backstop deckt alle Layer (inkl. system) ab, Catalog-Disziplin ist lückenlos. Die bekannte Drift (admin→comments-String-Kopplung, core→system-Tabellen) ist exakt in dem Zustand, den die Docs beschreiben.

**Top-Risiken (alle Medium/Low, priorisiert):**

1. **GDPR-Löschgarantie hat zwei weiche Stellen.** Die dokumentierte Garantie „`users.delete` nur bei Voll-Erfolg" wird an zwei Stellen durch `catch`-Schlucken unterlaufen: der system-Contributor kann einen echten Query-Fehler als „0 Notifications" melden (→ Löschung meldet Erfolg, Empfänger-Notifications überleben), und der Sperr-Schritt im Orchestrator ist best-effort (→ Teilfehler kann einen NICHT gesperrten Account hinterlassen, obwohl die Docs „gesperrt" garantieren).
2. **Two-Phase-Hide ohne Reconciliation.** Schlägt der best-effort-Permission-Entzug beim Ausblenden still fehl, bleibt ein `hidden`-Kommentar per Roh-REST für Gäste lesbar — genau der 2026-07-02 geschlossene Leak, als seltener Restpfad ohne Selbstheilung.
3. **Visitor-weiter CSS-Injection-Pfad nur am Write-Boundary gesichert.** Font-Namen/Varianten-IDs landen roh im injizierten `<style>` aller Besucher; die Admin-Zod-Allowlists schließen den Pfad heute, aber es gibt keine Defense-in-Depth am Render-Sink und keinen Injection-Test — die Sicherheit hängt an zwei Regexes in einem anderen Layer.
4. **CONCEPT.md ist in drei Abschnitten stale** (A4 beschreibt noch den nativen WS-Client, A14-Matrix listet noch `presence` und kennt `custom_themes`/`custom_fonts` nicht, Package-Tabelle führt admin als „geplant", Stack-Tabelle sagt 1.9.0).

Alles Weitere ist Polish (Robustheits-Kanten, Template-Kosmetik, undokumentierte Caps).

---

## 2. Findings nach Schweregrad

### Critical
_Keine._

### High
_Keine._

### Medium

| # | Fundstelle | Problem | Impact | Fix |
|---|---|---|---|---|
| M1 | `packages/system/server/utils/userDataContributor.ts:71-77` | Das gemeinsame `.catch(() => [])` (Z. 74) deckt BEIDE Notification-Queries ab — gedacht als akzeptierte E8-Lücke für den `senderId`-Pfad (Pre-008-Rows), schluckt aber auch echte/transiente Fehler des `recipientId`-Queries | GDPR-`deleteUserData` meldet Erfolg, obwohl Empfänger-Notifications überleben → `deleteUserCompletely` führt `users.delete` aus, „Voll-Erfolg"-Garantie verletzt | `catch` auf den `senderId`-Filter beschränken (`filter === senderId ? [] : throw`) |

### Low

| # | Fundstelle | Problem | Impact | Fix |
|---|---|---|---|---|
| L1 | `packages/core/server/utils/userDataOrchestration.ts:142` | GDPR-Schritt (2) `updateStatus(blocked)` ist `.catch(() => {})` — der einzige Schritt mit Garantie-Charakter („Teilfehler hinterlässt GESPERRTEN Account"), der geschluckt wird. Snapshot (strikt, `:137-138`), Contributor-Fehlererfassung (`:160-162`) und `users.delete`-Gate (`:175-177`) sind korrekt strikt | Bei Block-Fehler + späterem Teilfehler bleibt ein handlungsfähiger, halb bereinigter Account | Block-Fehler in den `results`-Report aufnehmen oder strikt werfen |
| L2 | `packages/admin/server/api/admin/comments/[id]/status.patch.ts:21,125` | Two-Phase-Hide: Permission-Entzug (Phase 2) ist `.catch(() => {})` ohne Reconciliation-Sweep | Seltener Restpfad: `hidden`-Kommentar bleibt bis zum nächsten manuellen Hide/Restore per Roh-REST gast-lesbar (Rest des geschlossenen hidden-REST-Leaks) | Fehler loggen + Retry, oder Reconciliation beim nächsten Queue-Read |
| L3 | `packages/themes/shared/fonts.ts:43,50-51` · `shared/ramp.ts:213` | `font.name` bzw. `variant.id` landen roh im inline `<style>` (jeder Besucher, auch Gäste). Write-Boundary ist heute dicht (verifiziert: `admin/server/api/admin/fonts/index.post.ts:12` + `[id].patch.ts:11` Regex `^[a-z0-9][a-z0-9 _-]{0,63}$`; `themes/index.post.ts:30` + `[id].patch.ts:30` Regex `^[a-z0-9-]{1,24}$`) — aber der Render-Sink vertraut blind darauf, dass diese Routen die einzigen Writer bleiben (Seed/Console/künftige Writer umgehen sie) | Wenn die Allowlist je gelockert oder umgangen wird, ist der Head aller Besucher die Blast-Radius (CSS-Injection → `</style>`-XSS) | Escaping/Assert in `customFontCss` + `customThemeCss` (Defense-in-Depth), Injection-Test neben `tests/fonts.test.ts`; Allowlist als geteilte Konstante zwischen admin-Schema und themes-Sink |
| L4 | `packages/admin/server/api/admin/storage.get.ts:29-62` | Orphan-Erkennung paginiert per `Query.offset` (statt Cursor wie überall sonst) — bei parallelen Signups können Rows übersprungen/doppelt gezählt werden | Avatar könnte kurzzeitig fälschlich als Orphan in den Bulk-Delete laufen (geringes reales Risiko) | Auf Cursor-Pagination umstellen |
| L5 | `packages/core/server/api/notifications/index.get.ts:22,36` | `unread`-Badge zählt nur über die neuesten 50 Rows | Undercount bei >50 Notifications; heilt sich beim Bulk-Mark selbst | Count-Query getrennt oder dokumentieren |
| L6 | `packages/moderation/server/api/reports/resolve.post.ts:31` | `Query.limit(500)` als undokumentiertes Magic-Cap (Read-Seite dokumentiert `WINDOW=500`, Resolve-Seite nicht); kein Log bei Überlauf | >500 offene Meldungen pro Target: Überschuss bleibt still `open`, `resolved`-Count untertreibt | Geteilte benannte Konstante + Log bei `open.total > 500` |
| L7 | `packages/moderation/server/plugins/dashboard-stats.ts:11` | Hartkodiertes `targetType 'comment'` im moderation-eigenen Stats-Plugin | Dünner A14-Leak: moderation soll target-agnostisch sein; welche targetTypes existieren, ist Konsumenten-Sache | Stats-Contribution zum Konsumenten verschieben oder targetTypes konfigurierbar |
| L8 | `functions/changelog-draft/src/main.js:94,98` | `APPWRITE_API_KEY`-Env-Fallback (statisch, langlebig) neben dem dynamischen `x-appwrite-key`; `setKey(apiKey)` ohne Truthiness-Guard | Fehlkonfiguration → breiterer Key als nötig; fehlender Key → verwirrender generischer 500 | Env-Fallback entfernen, Early-Guard mit Log |
| L9 | `apps/_template/scripts/bootstrap.ts:37` (+ Z. 5-6) | Fehlermeldung/Usage-Header zeigen hart auf `apps/reddit-comments/.env`, obwohl das Script app-agnostisch ist | Irreführung beim Template-Kopieren | `APP_NAME`/`APP_DIR` interpolieren |
| L10 | `apps/_template/scripts/bootstrap.ts:132` | `--seed` ruft `pnpm --filter <app> seed`, aber das Template hat weder `seed`-Script noch `seed-demo.ts` | `bootstrap --seed` auf frischer Template-Kopie bricht am Seed-Schritt | `--seed` guarden oder als reddit-comments-only dokumentieren |
| L11 | `apps/reddit-comments/server/api/stats.get.ts:8` | Öffentlicher, auth-freier Endpoint mit Admin-Client, ohne Rate-Limit/Cache (liefert nur 2 Aggregat-Counts, kein PII) | Kleine Amplification-Fläche (2 Admin-Reads/Request) | Microcache oder Rate-Limit-Bucket (passt zur Caching/ISR-Idee in OPEN-ITEMS) |
| L12 | `packages/admin/server/api/admin/system/update.post.ts:85` | `error.message` in `statusText` (nur Spawn-Fehlerpfad, dev-only via `import.meta.dev`, `system.manage`-gated) | Vernachlässigbarer Env-Detail-Leak in Dev | `toH3Error`-Mapping auch hier |
| L13 | `packages/comments/scripts/migrations/006-orphan-replies.ts` + `006-target-url.ts` | Doppelte Migrationsnummer 006; Runner sortiert lexikografisch (deterministisch, beide idempotent + reihenfolge-unabhängig — verifiziert) | Rein kosmetisch/Konventionsbruch | Eine der beiden auf 010 umnummerieren (nur Doku/Konsistenz) |
| L14 | `packages/system/server/utils/userDataContributor.ts:26` | `systemExportUserData` ohne expliziten Return-Typ (strict-Konvention; `systemDeleteUserData:63` macht es richtig) | Kosmetik | Typ annotieren |
| L15 | `packages/comments/server/api/comments/index.get.ts:77,79` | `controversial`-Sort cappt bei `CONTRO_CAP=200` Top-Level-Threads, stille Trunkierung darüber (per Kommentar Z. 15-17 bewusst) | Nur bei unrealistischem Volumen relevant | Als bekannte Grenze dokumentiert lassen |

### Bekannte Drift (§2 — dokumentiert, NICHT als neue Findings werten)

| Drift | Aktueller Stand (verifiziert) |
|---|---|
| admin→comments String-Kopplung (`tableId: 'comments'`) | Von 9× auf **4 Routen** reduziert; `stats.get` ist via `collectDashboardStats` sauber entkoppelt. Verbleibend: `admin/server/api/admin/analytics.get.ts:78`, `search.get.ts:26`, `users/[id]/index.get.ts:45`, `comments/index.get.ts:47,60` (+ `status.patch.ts:12,19,55,71,95` Hide/Cascade). Zielbild laut Docs: expliziter Vertrag |
| core schreibt system-Tabellen | `core/server/utils/authAudit.ts:24` (audit_logs), `notify.ts:32` (notifications), `appConfig.ts:14` (app_config liest) — die dokumentierte Fundament→Fundament-Ausnahme, alles graceful für Apps ohne die Tabellen |
| Rate-Limit in-memory | Multi-Instanz-Grenze im Code dokumentiert (Phase-17-Thema) |
| `redirectOn:'all'`-SEO-Caveat | Bewusst zurückgestellt (OPEN-ITEMS 2026-07-02) |
| E8: Alt-Notifications ohne `senderId` | Akzeptierte, dokumentierte Lücke — aber siehe M1: der Catch dafür ist zu breit |

---

## 3. Architektur-Drift: Intended (Step 1) vs. Actual

**Die A14-Matrix hält in der Praxis.** Verifiziert pro Layer:

- **core**: besitzt null Tables (`dataExport.ts:34` bestätigt den Auszug des comments-Wissens); Verträge (`registerUserDataContributor`, `registerDashboardStatsContributor`, `notify`, `maui.admin.modules`) sind typisierte Exporte, kein String-Coupling. Zwei-Client-Disziplin, Cookie-Flags, JWT-Socket-Trennung (`useRealtimeClient.ts:56` — Cookie-Client nie mit JWT gemischt), `useRealtimeAccount` bewusst cookie-nativ belassen. ✓
- **system**: reiner Schema-Owner + GDPR/Stats-Anbieter, kein UI, keine Feature-Imports; keine `presence`-Tabelle mehr (grep-verifiziert). Die öffentlichen `GET /api/themes` + `/api/fonts` in system sind vertretbares Schema-Owner-Verhalten (Owner serviert eigene read(any)-Rows für den SSR-Head), aber **nicht in der A14-Matrix abgebildet** → Doku-Drift D2. ✓ mit Doku-Lücke
- **moderation**: vollständig target-agnostisch bis auf L7; Verträge `myOpenReportTargetIds` (chunked à 100 — nachverifiziert, kein Query-Cap-Problem) / `openReportsByTarget` generisch. ✓
- **themes**: kein `server/`, kein Appwrite-Import, Writes gehen an `/api/admin/themes*`, Realtime über den geteilten Core-Socket. Genau wie CLAUDE.md („Tables besitzt system, Admin-Routen admin"). ✓
- **comments**: besitzt nur eigene Tables; Report-UI über den moderation-Vertrag; notify/mentions über Core-Verträge. ✓
- **admin**: besitzt nur `changelog`; kein Feature-Code-Import (`@maui/comments` in `system.get.ts:8` ist ein Versions-Label-String); Moderation läuft über den Vertrag, nicht daran vorbei. Rest-String-Kopplung = bekannte Drift (s. o.). ✓
- **apps**: dünn, extends-Reihenfolge korrekt (`themes, admin, comments, moderation, core, system`), error.vue-Wrapper, Gates explizit. ✓
- **ESLint-Backstop** (`eslint.config.mjs:35-68`): themes verbietet appwrite/node-appwrite + alle Features + core; Feature-Block (comments/admin) verbietet Feature-Querimporte; Fundament-Block **enthält system**. Vollständig. ✓

**Doku-Drift (CONCEPT.md hinkt der Realität hinterher — Umkehrung des üblichen Problems):**

- **D1**: CONCEPT A4 beschreibt noch den nativen WebSocket-Client als aktuellen Stand; real läuft seit P1 (2026-07-01) die eine geteilte JWT-SDK-Realtime (`useRealtimeClient.ts`). CLAUDE.md ist korrekt, CONCEPT nicht nachgezogen.
- **D2**: CONCEPT A14-Matrix: system-Zeile listet noch `presence` (Tabelle existiert nicht mehr) und kennt `custom_themes`/`custom_fonts` (Migrationen 009–013) nicht.
- **D3**: CONCEPT Package-Tabelle führt `packages/admin` als „🔜 Geplant" (real: seit Phase 13), Stack-Tabelle nennt Appwrite 1.9.0 (real: 1.9.5), `packages/moderation`/`system` fehlen in der Tabelle.
- **D4**: `scripts/migrate.mjs:16` sagt „numerisch sortiert" — bei Nummern-Gleichstand (L13) entscheidet real der Dateiname.

---

## 4. Requested-Changes-Reconciliation

Phasen 1–16 (Fundament: Monorepo, Design, Appwrite SSR, Auth, Layouts, Utils, i18n, Tests, CI, comments-Layer, App, Security, admin, Moderation, themes, Auth-UX) sind per README ✅ und wurden von den Slice-Workern implizit als Ist-Zustand bestätigt — nicht einzeln gelistet. Ab Phase 17 bzw. für alle Pläne:

| Change/Feature | Quelle | Status | Evidenz |
|---|---|---|---|
| Phase 17 Production Deployment | GOALS Ph. 17, plans/PHASE-17-PRODUCTION.md, OPEN-ITEMS 🟠 | **Missing (geplant)** | `deploy.yml` dokumentiertes Skeleton (workflow_dispatch, Webhook auskommentiert) — planmäßig |
| Changelog Track 2B (Function) | plans/CHANGELOG-2B-AKTIVIERUNG.md, README Ph. 32 | **Done (deploy-bereit, bewusst inaktiv)** | `functions/changelog-draft/src/main.js` (HMAC korrekt: raw body `:127`, timing-safe `:130`, kein Secret ⇒ beide Pfade dicht `:73,124`; Draft `published:false` `:109`); `appwrite.config.json:17` Scopes minimal |
| Phase 21 RBAC | RBAC-CONCEPT Phasen 1–3 | **Done** | Alle `/api/admin`-Routen capability-gated (Worker-Vollprüfung); `role.patch.ts:23-47` Eskalations-/Selbst-/Last-Admin-Schutz; Pages `requiredCapability` |
| RBAC Phase 4 (Rolle `editor`) | RBAC-CONCEPT §Phasen 4 | **Missing (dokumentiert offen)** | Kein `editor` in der Matrix; Nav-Link-Problem in RBAC-CONCEPT beschrieben |
| Phase 22 Layer-Matrix + ESLint-Backstop | CONCEPT A14 | **Done** | `eslint.config.mjs:35-68` — alle drei Blöcke, system enthalten |
| Phase 23 moderation-Layer | MODERATION-AND-LAYER-BOUNDARIES Teil B | **Done** | `packages/moderation` vollständig: Unique-Index `001-reports.ts:101-103`, Lifecycle, Verträge `reportQueries.ts:16,51` |
| Phase 25 system-Layer (Inversions-Fix) | CONCEPT A14-Kasten | **Done** | `packages/system` Schema-Owner; erster Server-Code via GDPR (plan-konform) |
| Phase 27 Cascade-Hide + notify()-Vertrag | OPEN-ITEMS „total-Semantik" | **Done** | `status.patch.ts:95ff` (BFS-Cascade), `core/server/utils/notify.ts` |
| Phasen 30/31 Presence vereinheitlicht + realtime | OPEN-ITEMS Phase-18-P2 | **Done** | Eine Presence/User (`heartbeat.post.ts`, presenceId=userId, zod-Metadata, read("users"), server-side write); keine presence-Tabelle |
| Phase 32 Realtime-Konsolidierung (P1) | OPEN-ITEMS P1 | **Done** | `useRealtimeClient.ts` ein JWT-Socket, Rows+Presence+Flags multiplexen; `realtime-token.get.ts:15` session-pflichtig, 900 s; `useRealtimeAccount` cookie-nativ belassen |
| Phase 34: Vote-Privacy (007), hidden-REST-Leak (008), toH3Error-Serie, Migrations-Runner + _template, @-Mentions, Markdown | OPEN-ITEMS Gesamtcheck-Abarbeitung | **Done** | comments-Migrationen 007/008 verifiziert; Row-`read(any)` bei Create (`index.post.ts:60-64`); `scripts/migrate.mjs` (--app-Pflicht, Abbruch bei Fehler `:110-113`); `mentions.ts` (Thread-Teilnehmer, max 5); `shared/markdown.ts` vnode-Parser ohne v-html. Rest-Kante: L2 (Phase-2-Entzug best-effort) |
| Phase 35 GDPR komplett | plans/GDPR-DELETE-AND-EXPORT.md | **Done (2 Robustheits-Kanten)** | Orchestrierung plan-konform: Snapshot strikt (`userDataOrchestration.ts:137-138`), Audit ohne Klarname (`:147`), Contributors isoliert (`:155-163`), `users.delete` nur bei allOk (`:175-177`), Bucket `gdpr-exports` (encryption, keine Bucket-Perms, `bootstrap.ts:66-95`), Lazy-Cleanup, Admin-Routen `users.manage`. Kanten: **M1**, **L1** |
| Phase 36 Observability-Gate | README Ph. 36 | **Done** | `core/server/error.ts:20-26` (5xx-Gate, 4xx still, keine Header/Bodies), `telemetry/error.post.ts:19` (404 bei Gate aus, Zod, 30/min), Client-Plugin dedupe/cap |
| Phasen 37–43 Theme-Studio v1 + v2 A/B/C + Fonts + Typografie-Rollen | THEMES-CONCEPT-V2 Phasenplan | **Done** | Vollseiten-Editor + Dock, Szenen (inkl. Branding + Charts), Kurven, Tinted Neutral, darkAlias, JSON-Export/Import, WOFF2-Verwaltung (`fonts/upload.post.ts:7-33` Magic-Bytes+3 MB+Bucket fix), 2 Schrift-Rollen + Legacy-Mapping; abgelehnte Features (Slot-Zoo, Radius-Dreiteilung, freie Font-Eingabe) sind NICHT eingesickert |
| Phase 44 verwaiste Antworten | README Ph. 44 | **Done** | `006-orphan-replies.ts` (idempotent), Store-Guard total>rows |
| Phase 45 Live-Theme-Propagation | README Ph. 45 | **Done** | system-Migration 013 (read(any), kein Perm-Clobber — verifiziert), `realtime-themes.client.ts:27-30` über den geteilten Socket, debounced |
| packages/billing (Stripe) | plans/BILLING-STRIPE.md | **Missing (Plan, braucht Go)** | Kein `packages/billing` im Tree — planmäßig |
| Embed-Widget | plans/EMBED-WIDGET.md | **Missing (Plan)** | Vorbedingung E0-1 (hidden-Leak) erledigt; kein Embed-Code — planmäßig |
| Themes-Vollausbau 26×11 | plans/THEMES-VOLLAUSBAU.md | **Missing/teils überholt** | Studio (Ph. 37–43) ist der vorgezogene Grundstein; 26er-Katalog + committetes Generator-Script weiterhin offen (Script laut Plan nicht im Repo — bestätigt) |
| Ideen 1–5 (E-Mail-Digest, Bulk-Aktionen, Caching/ISR, CI-Appwrite, Report-Kategorien) | OPEN-ITEMS 💡 | **Missing (Backlog by design)** | Keine Spuren im Code — konsistent mit Doku |

**Fazit Reconciliation: kein einziges „Regressed".** Alles, was die Docs als erledigt führen, ist im Code nachweisbar; alles Fehlende ist dokumentiert offen.

---

## 5. Cross-Slice-Themen (für Einzel-Slice-Worker unsichtbar)

1. **Best-effort-Catch-Disziplin ist stark — aber zwei tragende Stellen sind mitgerutscht.** Das Muster „`.catch(() => {})` mit Begründungs-Kommentar" ist projektweit sauber angewendet (Dutzende geprüfte Stellen, alle legitim). Genau an den zwei Stellen, wo Docs eine *Garantie* formulieren (GDPR-Voll-Erfolg → M1, Sperr-Garantie → L1, Hide-Phase-2 → L2), kippt best-effort in stilles Garantie-Unterlaufen. Empfehlung als Klasse behandeln: Garantie-Schritte werfen oder landen im Fehler-Report, nie im Schlucken.
2. **Write-Boundary ↔ Render-Sink über Layer-Grenze (L3).** Die Sicherheit des in jeden Besucher-Head injizierten CSS hängt an zwei Zod-Regexes im admin-Layer, während der Sink im themes-Layer liegt — verbunden nur durch einen Kommentar. Eine geteilte Allowlist-Konstante + Test würde den impliziten Vertrag explizit machen (dasselbe Prinzip wie A14 Stufe 1).
3. **Duplizierte Konstanten/Regexes über Layer:** `WINDOW=500` (moderation read-side dokumentiert vs. resolve-side magic, L6) und die targetUrl-Guard-Regex (identisch in `comments/schemas/comment.ts:25` und `shared/markdown.ts:29` — Drift-Risiko bei künftiger Änderung).
4. **CONCEPT.md-Staleness (D1–D3)** ist ein Cross-Doc-Thema: CLAUDE.md und README sind aktuell, CONCEPT.md nicht — genau die Doppelpflege-Falle, die v2.1 bei der CLAUDE.md-Kopie schon einmal gelöst hat.
5. **X-Forwarded-For-Vertrauen** (`core/server/utils/authAudit.ts:22-23`, Rate-Limit-Keys): korrekt nur hinter Trusted Proxy — gehört als expliziter Punkt in die Phase-17-Checkliste (ploi/nginx terminiert, ok; direkte Exposition nicht).
6. **`_template` als Kopiervorlage driftet von reddit-comments** (L9/L10): bootstrap byte-identisch kopiert inkl. reddit-comments-spezifischer Meldungen und eines `--seed`-Pfads ohne Seed-Script. Template-Pflege braucht eine eigene Checkliste oder einen Sync-Test.

---

## 6. Offene Fragen an den Maintainer

1. **M1/L1 (GDPR):** Sollen Block- und Recipient-Query-Fehler strikt in den Fehler-Report? (Empfehlung: ja — beides sind Garantie-Schritte.)
2. **L2 (Hide Phase 2):** Reconciliation gewünscht (z. B. beim Queue-Read `hidden`-Rows ohne entzogene Permission nachziehen), oder bewusstes Restrisiko?
3. **Presence-Metadata-Scope:** `heartbeat.post.ts:27` schreibt `userName`/`avatarUrl` mit `read("users")` — jeder eingeloggte User kann alle Presences samt Namen lesen. Gewollt (app-weite Presence-Avatare) oder auf Co-Presence einschränken?
4. **Deleted-Placeholder in Totals:** `comments/index.get.ts:118-120` zählt `deleted`-Tombstones in `total`/`topLevelTotal` (Spec-konform „[gelöscht]"-Platzhalter) — Produktentscheidung bestätigen.
5. **`stats.get.ts` (L11):** Microcache/Rate-Limit jetzt, oder mit der Caching/ISR-Idee (OPEN-ITEMS Nr. 3) bündeln?
6. **CONCEPT.md-Refresh (D1–D3):** als eigener Doku-Batch nachziehen, oder bewusst nur CLAUDE.md/README als Single Source pflegen und CONCEPT als historisches Konzept markieren?
7. **`changelog`-Index:** Key-Index auf boolean `published` (`admin/scripts/migrations/001-changelog.ts:80`) — gewollte Selektivität?

---

## Anhang: Slice-Gesundheit auf einen Blick

| Slice | Findings | Zustand |
|---|---|---|
| core | 2 Low (L1, L5) | Sehr sauber; alle A2/A3/A4-Invarianten verifiziert |
| system | 1 Medium (M1), 2 Low (L13-Anteil, L14) | Sauber; Migrationen idempotent, kein Perm-Clobber |
| moderation | 2 Low (L6, L7) | Sehr sauber; Verträge generisch, Chunking korrekt |
| themes | 1 Low (L3) | Sehr sauber; A14 strikt eingehalten (kein Appwrite) |
| comments | 2 Low (L13, L15) | Sehr sauber; Row-Permissions, Votes, Markdown, GDPR korrekt |
| admin | 3 Low (L2, L4, L12) + bekannte Drift | Sauber; RBAC vollständig, Verträge genutzt |
| apps | 3 Low (L9, L10, L11) | Sauber; Komposition + Gates korrekt |
| functions | 1 Low (L8) | Sauber; HMAC korrekt, keine Leaks |
| config/build | 0 | Vollständig sauber |
