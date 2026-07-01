# Offene Punkte

Stand: 2026-07-02 (nach dem Gesamtcheck). Vollständige, eigenständige Liste
offener Themen (für eine frische Session als Startpunkt nutzbar).
Reihenfolge = grobe Priorität.

## 📋 Gesamtcheck 2026-07-02 — offene Findings (5 Review-Agenten + Verifikation)

Der Check lief über Security, Client-Bugs, Server-Korrektheit, Architektur und
Docs-Abgleich (Appwrite/Nuxt/Nuxt UI). 20+ bestätigte Funde wurden SOFORT
gefixt (siehe „Bereits erledigt"). Offen bleiben:

### 🟠 Mittel — als Nächstes angehen
- **GDPR: Account-Löschung hinterlässt PII** (`core/auth/account.delete.ts`, `admin/users/[id]/index.delete.ts`): `users.delete()` entfernt nur den Auth-User — comments (authorName öffentlich!), votes, reports, notifications, Avatar-Datei bleiben. Fix: Anonymisierungs-/Cleanup-Schritt (best effort, Admin-Client). Dazu **Export unvollständig**: `Query.limit(1000)` ohne Pagination + votes/reports fehlen im Export.
- **Layer-Kopplung core→comments (A14-Verletzung)**: der GDPR-Export liest `tableId:'comments'` samt Schema im Fundament-Layer (`core/server/utils/dataExport.ts`). Sauber: Export-Contributor-Vertrag (Feature-Layer registrieren `exportUserData(userId)`-Provider). Gleiches Muster für die GDPR-Löschung nutzen → löst beide Punkte zusammen.
- **admin ohne comments = 500**: `admin/stats.get.ts` (u.a.) queryt `comments` ohne catch — eine zweite App mit admin, aber ohne comments-Layer, crasht im Dashboard. Kurzfix: `.catch` + 0-Fallbacks; sauber: Stats-Contributor-Registry analog `maui.admin.modules`.
- **Migrations auf reddit-comments gepinnt**: alle `migrate`-Scripts hardcoden `--env-file=../../apps/reddit-comments/.env` — App 2 würde damit die FALSCHE Instanz migrieren. Fix: Runner mit env-Parameter; MDC/prosemirror-Config von der App in den admin-Layer ziehen; `apps/_template` als Kopiervorlage.
- **`comment_votes` für alle eingeloggten User lesbar** (Table-Permission `read(users)` aus Migration 002): Voting ist nicht anonym — jeder User kann per Web-SDK alle Votes listen. Row-Security reicht (Rows haben `read(user:self)`) → Table-Read per Migration entfernen (vorher prüfen: kein Realtime-Consumer braucht fremde Vote-Rows — aktuell keiner).
- **`hidden`-Kommentare via Appwrite-REST lesbar**: die comments-Table ist `read(any)` (Realtime für Gäste braucht das) — der Status-Filter existiert nur in der Nuxt-Route. Bewusster Trade-off; Optionen: dokumentiert lassen, oder Realtime auf `read(users)`+JWT umstellen (Gast-Livecomments entfielen).
- **UAuthForm-Regel vs. Realität**: CLAUDE.md fordert „UAuthForm für Auth!", Login/Register/OTP sind aber handgebaut (UForm/UFormField). Entscheiden: auf UAuthForm refactoren ODER die Regel streichen.
- **Fehler-Mapping-Serie (500→404)**: ~7 Routen fangen Appwrite-Fehler nicht (`admin/changelog/[id].patch/.delete`, `users/[id]/status.patch`, `sessions.delete`, `storage/[fileId].delete`, `core/storage/[bucket]/[fileId].get/.delete`, `auth/otp.post`) → `toH3Error` nachziehen (mechanisch).

### 🟡 Klein / gelistet
- **Vote-Lost-Update bei parallelen Usern**: Recount+Write ohne Konfliktbehandlung — selbstheilend beim nächsten Vote; Option: pro commentId in-process serialisieren oder Appwrite-Transactions (seit 1.9).
- **Client-Kleinbugs**: Dashboard-Suche ohne Stale-Response-Guard; Vote-Doppelklick ohne In-Flight-Serialisierung; `useRealtimeAccount`-Backoff greift bei open→sofort-close nicht (+ läuft auch für Gäste); Reply auf gepufferten pending-Kommentar wird verworfen; WhatsNew-Unread nutzt kuratiertes `date` statt `$createdAt`; Logout räumt Presence nicht ab (`/api/presence/leave` mitrufen) + ohne try/catch; IntersectionObserver reobserved nicht bei temp-ID-Austausch; `dashboard/comments.vue` watcht `route.query.status` nicht; `users/[id].vue` hartkodiertes „— 404".
- **i18n**: admin nutzt 7× `t('comments.item.cancel')` → eigener `ui.cancel`-Key in core; tote Keys (`admin.users.makeAdmin/revokeAdmin/...`, `admin.stats.onlineHint`, …) entfernen.
- **Effizienz**: `assertNotLastAdmin` scannt alle User (→ `Query.contains('labels','admin')` + limit 2); `resolve.post` sequentiell (→ Chunks); `presences.list({ total: false })`-Mikro-Optimierung; `login.post` könnte den Namen an `recordAuthEvent` durchreichen (spart 1 users.get/Login).
- **Kanten (dokumentiert, bewusst)**: REPLY_CAP 500 über alle Threads; Cascade-Hide THREAD_CAP 500; users-active-Sort FETCH_CAP 500 vs. echte total; changelog FETCH_CAP 500; presence limit 200 ohne Pagination; Analytics-Offset-Shift; Rate-Limit `unknown`-IP-Bucket; Storage-MIME ohne Magic-Bytes-Check (GET liefert mit deklariertem Content-Type aus → entschärft).
- **Kleinkram**: `appwrite.json` → `appwrite.config.json` (neuer CLI-Name); `useFormatCurrency` ungenutzt (bewusste Baukasten-Vorhaltung?); PresenceAvatar könnte auf `UChip` (#content-Slot) umziehen; `redirectOn:'all'`-SEO-Caveat dokumentieren; V3/V4-Layer-Findings (comments registriert admin-Key/-Route; UserMenu verlinkt /dashboard hart); A14-Matrix um die reale core→system-Schema-Nutzung ergänzen + Flag-Registry statt `commentsEnabled` hart in core.

### 💡 Ideen fürs nächste Level (aus dem Check, priorisiert)
1. **App-Template + entkoppelte Migrations** (M) — der Beweis, dass der Baukasten ein Baukasten ist; Blocker für 3002+.
2. **@-Mentions mit Notification** (M) — `notify()`-Vertrag + targetUrl-Guard existieren schon.
3. **Markdown/Rich-Text für Kommentare** (M) — MDC + TipTap-Deps sind bereits im Stack (Changelog nutzt beides).
4. **E-Mail-Notifications + Digest** (M–L) — notifications-Table + SMTP + Function-Scaffold vorhanden.
5. **Observability-Gate `maui.observability`** (S–M) — Sentry/strukturierte Logs am zentralen error.ts andocken; vor Phase 17 fast Pflicht.
6. **Admin-Bulk-Aktionen + CSV-Export** (S–M) — Moderations-Queue/Users mit Multi-Select, Claim-Locks laufen schon.
7. **Caching/ISR** (S) — routeRules SWR für /changelog + Microcache für GET /api/comments Seite 1.
8. **CI mit echter Appwrite-Instanz** (M) — Service-Container + `bootstrap --seed` (idempotent vorhanden) → Realtime-E2E in CI.
9. **Embed-Widget** (L) — targetId/targetType-Architektur ist dafür gebaut (Disqus-Nische, self-hosted).
10. **Report-Kategorien + Auto-Hide-Threshold** (S–M) — `openReportsByTarget` zählt schon.

## 🟠 Mittel — lohnt sich

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

## 🟡 Niedrig

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

## 🔧 Cleanup / Improvements / NITs

- ✅ **Status-Codes** (2026-06-29): `status.patch`-`getRow` → 404 (statt 500) und `status.patch`-`updateRow` + `users/[id].delete`-`users.delete` via `toH3Error` gemappt. `comments/index.post` und `config.patch` waren bereits via `toH3Error` sauber, `users.get`/`appConfig` schon abgefangen.
- ✅ **i18n/A11y** (2026-06-29, bereits erledigt — Note war stale): Sidebar-Labels nutzen `t('dashboard.sidebar.*')` (Keys de+en vorhanden); [AnalyticsTrendChart.vue](../packages/admin/app/components/AnalyticsTrendChart.vue) hat `role="img"` + `aria-label` + per-Bar `<title>`; [OtpLoginForm.vue](../packages/core/app/components/auth/OtpLoginForm.vue)-`resend()` setzt `errorMessage = null` vor dem Request.
- ✅ **Dead Code** (2026-06-29): `useSeo.ts` entfernt (nur `useSeoMeta` wird genutzt). `useAnalytics.ts` und `RowList<T>` existierten schon nicht mehr.
- ✅ **Duplizierung** (2026-06-29, bereits konsolidiert — Note war stale): Avatar-Auflösung → `core/server/utils/avatars.ts` (`resolveAvatars`, von comments/presence/audit genutzt); GDPR-Export-Mapper → `core/server/utils/dataExport.ts` (`mapExport*`, beide Export-Endpoints); Changelog-Row→DTO → `admin/shared/changelog.ts` (`rowToChangelogEntry`, public + admin).
- ✅ **Coverage-Lücke** (2026-06-29, geprüft — keine echte Lücke): Der App-`nuxi typecheck` (reddit-comments extends ALLE Layer) prüft transitiv auch deren Server-Code — per absichtlichem Typfehler in `moderation/.../reportQueries.ts` verifiziert (wird gefangen). Kein `test`-Script-Gap: themes/moderation/system haben 0 Tests, comments/admin/core haben Tests + Script. Standalone-Typecheck pro Layer bräuchte je ein `.playground` (wie core) — bewusst nicht.
- ✅ **NITs** (2026-06-29, geprüft): `stats.get.ts` nutzt schon die moderne `users.list({ queries })`-Form; `.env.example` enthält `NUXT_PUBLIC_APPWRITE_PROJECT_NAME` nicht (mehr) und nirgends Code-Nutzung — beide stale. Bewusst akzeptiert: `isOutdated`-Prerelease-Ordering (installed/latest kommen aus stable-only package.json/Registry → Pfad triggert real nie, ein Fix wäre toter Code) und CI-`@vN`-Tags (Dependabot-managed, first-party/reputable Actions).
- ✅ **Hydration-Mismatch (relative Zeit)** (2026-07-01): „vor X Sekunden" renderte server/client mit unterschiedlichem `now` → ~16 Mismatches + Vue-Warnungen pro Load. Fix: `now`-Basis in [useFormatRelativeTime](../packages/core/app/composables/useFormatRelativeTime.ts) via `useState` (SSR→Client identisch), Update erst nach Mount + 30s-Ticker. Verifiziert: 0 Mismatches/0 Warnungen.
- ✅ **Destruktive Migration `comments-002`** (2026-07-01): Migration ist jetzt idempotent — sind beide Tables schon am Zielschema (Pflichtspalten `targetId`/`content` bzw. `commentId`/`userId`/`value` vorhanden), wird der DROP übersprungen (kein Datenverlust bei Re-Run). `createTable`/Spalten/Indizes sind ohnehin 409-idempotent; der Erst-Umbau (altes `postId`-Schema → Ziel) droppt weiterhin wie vorgesehen.
- ✅ **Zwei Presence-Systeme vereinheitlicht** (2026-07-01): Globale Online-, Thread- und Moderations-Presence teilen sich jetzt **eine** Presence pro User (`presenceId=userId`, metadata trägt `scope`/`action`/`typing`) über die Presences-API. `usePresenceState()` ist die einzige Upsert-Autorität, `usePresence(predicate)` liest gefiltert. Entfernt: `presence`-Table, `presenceRowId` (der `presence/leave`-Endpoint EXISTIERT weiterhin — er löscht die Presences-API-Presence per sendBeacon beim Verlassen). `admin/users`-Routen lesen `listOnlinePresences()`; „online jetzt" via `updatedAt`-Recency (60s). Neue Use-Cases: Moderations-Claim-Lock (`useModerationPresence`), Edit-Awareness auf Config/Changelog (`useEditAwareness`), Live-Online im Dashboard + Users-Liste. **Nachtrag (verifiziert per Playwright + Live-Appwrite):** In der SSR-Cookie-Architektur kann der Browser seine Presence nicht selbst schreiben (Web-SDK-Client ohne Session → `realtime.upsertPresence()` als Guest-WS verworfen, `PUT /presences` → 401). Der WRITE läuft daher server-seitig über `POST /api/presence/heartbeat` (Admin-Client, `read("users")`, `expiresAt` 90s); `usePresenceState` ruft die Route (Heartbeat 20s + `visibilitychange`/`focus`). Der Reader liest weiter direkt über die Presences-API (Cookie-GET). Ohne diesen Fix fielen eingeloggte User nach 60s auf „offline".
- ✅ **Echtes Realtime-Presence** (2026-07-01, ~280ms verifiziert, in production): (1) WS-Upsert (`realtime.upsertPresence`, JWT-Client, Owner-Rechte) — nur der WS-Weg löst das Event aus, der HTTP-Upsert nicht; (2) JWT-authentifizierter Reader-WS (empfängt `read("users")`-Events); (3) **gesunder realtime-Worker** — der laufende war durch einen Swoole-Crash degradiert und lieferte nichts, `docker compose up -d --no-deps appwrite-realtime` hat es gefixt. Poll (20s) ist jetzt nur noch Backstop. Betriebs-Hinweis: bei degradiertem Worker Container neu erstellen (der User hatte mit „muss neugestartet werden?" recht).
- ✅ **Presence-Use-Cases erweitert** (2026-07-01, verifiziert per Playwright): neue metadata-Felder `page`/`replyingTo`/`near` (je eigener Zweck). (a) **Betrachtungs-Presence** (`useViewingPresence` + `DashboardViewers`): „N andere sehen diese Seite" global im Dashboard → deckt „anderer Admin schaut denselben User/dieses Dashboard an" + Live-Betrachterzahl pro Seite ab. (b) **Antwort-Presence**: offenes Antwort-Formular meldet `replyingTo` → Kommentar zeigt „X antwortet gerade …". (c) **Lese-Präsenz**: IntersectionObserver meldet den sichtbarsten Kommentar als `near` → „N lesen hier" je Kommentar. (d) **`PresenceAvatar`** (core): Icon-Badge in der Ecke (Stift = tippt, Pfeil = antwortet) statt Farbpunkt. Damit sind alle vorgeschlagenen Presence-Beispiele umgesetzt.

## ⏸️ Zurückgestellt — brauchen Design

- ✅ **Cross-Layer-Write (Notifications)** (2026-06-29): Core stellt jetzt `notify(event, {...})` ([core/server/utils/notify.ts](../packages/core/server/utils/notify.ts)) als Vertrag bereit (best-effort, Row-Security); comments ruft ihn statt direktem `tableId: 'notifications'`-Zugriff. Kein String-Coupling mehr (CONCEPT A14). Der `/`-Link-Teil war schon gelöst (`targetUrl` + Open-Redirect-Guard).
- ✅ **`total`-Semantik / Hide-Orphaning** (2026-06-30, gelöst): **Client** — Hide entfernt jetzt den ganzen Subtree (`removeWithDescendants` + reine, getestete `descendantIds`), keine verwaisten Replies, `rows`/`total` konsistent. **Server (Cascade-Hide, gewählt)** — `status.patch` blendet beim Ausblenden den Subtree mit aus (Thread per rootId laden → BFS → nur aktive Nachfahren), so zählt der globale `total` keine unerreichbaren non-hidden-Antworten mehr. Wiederherstellen kaskadiert bewusst nicht (nur der Parent; Antworten ggf. einzeln). Per-Nachfahre-Realtime-Events sind im Client reihenfolge-unabhängige No-ops.
- ✅ **Pro-Melder-Report-Modell** (2026-06-30, bereits gebaut als generischer `moderation`-Layer — Note war stale): `reports`-Tabelle mit `reporterId` + Unique-Index `reporter_target` (eine Meldung pro User/Target), eigener Rückzug (`index.delete` nach `reporterId` gefiltert), Status-Lifecycle, und Admin-Melder-Anzahl (`openReportsByTarget.counts` → `reportCount` in der Moderations-Queue). Das alte `'reported'`-Status-Flag am Kommentar ist entfernt (`status` = nur noch active/hidden/deleted). Übertrifft die ursprüngliche Spec (generisch statt comment-spezifisch). Einziger Rest: das akzeptierte LOW-`targetType`-Residual (s. Security-Review).
- ✅ **„Bearbeitet"-Indikator** (2026-06-29, bereits umgesetzt — Note war stale): `editedAt`-Spalte (Migration 005) wird beim Edit gesetzt ([id].patch.ts) und in CommentItem angezeigt — unabhängig von `$updatedAt`.

## 🗺️ Roadmap — bewusst ausgeklammert

- **Phase 17 – Production Deployment**: Prod-Appwrite (Hetzner), Domain, ploi.io-Site, Deploy-Webhook ([deploy.yml](../.github/workflows/deploy.yml) ist Skeleton).
- **Phase 18 – Realtime/Presence auf SDK** (🟡 teilweise erledigt, 2026-07-01 auf 1.9.5+MariaDB):
  - ✅ **P2 Presence** — **komplette** Presence (global + Thread + Moderation) auf die **Presences API** vereinheitlicht: eine Presence pro User (`presenceId=userId`, metadata `scope`/`action`/`typing`), `usePresenceState` als einzige Upsert-Autorität + `usePresence(predicate)` als Reader. Alt-System (Endpoints `presence/heartbeat|leave`, `presence`-Table system-007, `presenceRowId`) entfernt. Multi-User end-to-end verifiziert. Use-Cases live: Claim-Lock, Edit-Awareness, Live-Online (s. erledigtes Finding oben).
  - ✅ **P1 Rows-Rückbau** (2026-07-01) — `useRealtimeRows` läuft jetzt auf der **einen geteilten, JWT-authentifizierten SDK-Realtime** ([useRealtimeClient.ts](../packages/core/app/composables/useRealtimeClient.ts)): `realtime.subscribe(Channel.tablesdb().table().row())` mit optionalem server-seitigem `queries`-Passthrough; `where`-Filter bleibt als sicherer Default. Presence, Row-Streams und Config-Flags multiplexen über **denselben Socket** (vorher: ein nativer WS pro Aufruf). `useRealtimeAccount` bleibt bewusst cookie-nativ (Instant-Session-Revoke hängt am Cookie-Close-Signal). Tote `appwrite.client.ts` entfernt. Verifiziert per Playwright (Gast-Tab): Row-Create + -Delete live über den JWT-Socket, sauberer Reload ohne Console-Fehler.
  - ✅ **P3 Email-Policies** — Signup-UX für Wegwerf-/Free-Adressen (422→i18n); Console-Toggle ist der Betreiber-Schritt.
- **Backlog**: Themes-Vollausbau (26×11), `packages/billing` (Stripe), obsidian-community-concept.
  - ✅ **E2E-Tests (Playwright)** (2026-07-01): reddit-comments hat eine erste E2E-Ebene ([e2e/smoke.spec.ts](../apps/reddit-comments/e2e/smoke.spec.ts)) — auth-freie Smoke-Tests (Routing, SSR-Render, i18n, öffentliche Seiten, 404) gegen System-Chrome, `pnpm --filter reddit-comments e2e`. Eingeloggte/Realtime-Flows bleiben manuell verifiziert (passwortbasierter Login). Weitere Apps: sobald vorhanden.
- ✅ **Changelog Track 2B** (2026-07-01, deploy-bereit): Appwrite Function [functions/changelog-draft](../functions/changelog-draft) + [appwrite.json](../appwrite.json) — GitHub-Release-Webhook (HMAC) → Commits via Compare-API → Entwurf. Teilt die Parsing-Logik mit Track 2A (`src/parse.js`, unit-getestet). **Aktiv erst mit Prod + öffentlicher Domain** (GitHub muss den Webhook per HTTPS erreichen); bis dahin bleibt `pnpm changelog:draft` (2A) der Weg.
- **Sonstiges**: ✅ öffentliche `/changelog`-Vollhistorie-Seite existiert bereits ([changelog.vue](../packages/admin/app/pages/changelog.vue), auth-frei, alle Einträge). Offen (brauchen Input/Spec): die 10 gesammelten SaaS-Feature-Ideen (u. a. Embed-Widget) — nicht im Repo, in privaten Notizen.

---

## ✅ Bereits erledigt (Referenz)

- **Appwrite 1.9.5 + MariaDB-Umstieg + Phase-18-P2 + Tooling (2026-07-01)**:
  - **Server-Upgrade** Appwrite 1.9.0 → 1.9.5 (Backup, manueller Tag-Bump da
    Web-Installer interaktiv, `migrate`) — dann **DB-Adapter-Umstieg MongoDB →
    MariaDB** (frische Instanz, empfohlener Default). Stolpersteine gelöst:
    Traefik-Segfault (Neustart), SMTP → Mailpit, Console-Whitelist, fehlende
    1.9.5-Schema-Attribute (`migrate`), inkonsistente `main`-DB-Metadaten
    (neu angelegt), API-Key-Scopes.
  - **P2 Presence** auf die Presences-API (s. Phase 18).
  - **P3 Email-Policies**-UX (422 → freundliche i18n-Meldung im Signup).
  - **Bootstrap-Tooling**: `pnpm bootstrap` (DB + Bucket + Platform + alle
    Migrationen, Guard gegen destruktiven Re-Run) + `pnpm seed` (Demo-User mit
    Rollen + Kommentare). Beide reproduzierbar/idempotent.
  - **Security-Test**: XSS/HTML/JS/SQL-Payloads als Kommentar-Inhalt → alle
    escaped (Vue-Autoescaping, kein `v-html`), 0 injizierte Elemente, DB intakt.
  - **Hydration-Fix** (relative Zeit) + README-/Doku-Update.
- **Pre-Production Security Review (2026-06-29)** — Review über `d1a2e13..HEAD`
  (2 Review-Agents: Authz + Input/Leak/Redirect, plus eigener Pass):
  - **MEDIUM behoben — Stored Open-Redirect via `targetUrl`**: der alte Guard
    (`startsWith('/') && !startsWith('//')`) ließ protokoll-relative Bypässe
    durch (`/\evil` — Browser normalisiert `\`→`/` —, `/%2F%2Fevil`,
    Whitespace-Tricks `/ /evil`, `/\t//evil`). Diese flossen unverändert in den
    Reply-Notification-Link → Off-Site-Navigation (Phishing). Fix: strenge
    Regex `^\/(?![/\\%])[^\s\\]*$` im
    [comment-Schema](../packages/comments/schemas/comment.ts) **+**
    `safeLink()`-Render-Guard in
    [NotificationBell.vue](../packages/core/app/components/NotificationBell.vue)
    (defense-in-depth gegen alt gespeicherte Rows) **+** Regressionstest
    [schema.test.ts](../packages/comments/tests/schema.test.ts).
  - **LOW behoben — `reports/resolve`-Input-Hygiene**: lose `typeof`-Checks +
    unbegrenztes `resolution` → `resolveReportSchema` (Zod, längenbegrenzt).
  - **LOW behoben — Rate-Limiting auf Schreib-Endpoints**: `rate-limit`-Middleware
    deckt jetzt auch `POST /comments`, `PATCH /comments/[id]`, Vote und
    `POST /reports` ab (eigenes, weiteres Budget `WRITE_MAX=60/min`; Vote-Spam
    über viele IDs teilt EINEN Bucket). `reports/resolve` bewusst ausgenommen
    (Moderator-gated).
  - **Akzeptiertes Restrisiko (LOW) — `reports.targetType` ungeprüft**: ein
    eingeloggter User könnte Meldungen mit beliebigem `targetType`/nicht
    existierendem `targetId` absetzen. Entschärft: die Moderations-Queue filtert
    Junk bereits über Comment-Existenz; nur die „Gemeldet"-KPI ließe sich minimal
    aufblähen. Moderation bleibt bewusst domänen-generisch → kein Existenz-Check
    (würde den Layer an Comments koppeln). Sauberer Fix kommt mit dem
    zurückgestellten `comment_reports`-Modell.
  - **Sauber bestätigt (kein Defekt)**: Error-Envelope leakt keine Appwrite-/
    Zod-/Stack-Details; alle Authz-Guards (reports/comments/admin) korrekt,
    `reporterId` server-autoritativ; Moderations-Inputs parameterisiert (keine
    Injection, keine `Role`-Spoofing-Fläche).
- **3. Review-Pass (2026-06-24)** — neue Funde abgearbeitet:
  Storage-Orphan-Erkennung paginiert jetzt ALLE User+Files (vorher nur 100 →
  Falsch-Orphans, die der Bulk-Delete gelöscht hätte); Passwortänderung beendet
  Fremd-Sessions; Analytics-Chart-Buckets und KPI-Totals aus derselben
  In-Range-Menge (kein Balken-vs-Legende-Widerspruch mehr); Status-Guards auf
  Comment-PATCH + Vote (kein Editieren/Voten auf hidden/deleted per Direktrequest);
  Rate-Limit-Budget je Methode+Route (Reset-Confirm teilt nicht mehr das
  Mail-Budget); avatarUrl auf relative Storage-URL/https eingeschränkt;
  Notifications mit zusätzlichem recipientId-Filter; loadAll iteriert über
  Seitenzahl (controversial überspringt keine Zeilen); changelog-date als
  ISO-datetime validiert; OAuth-Redirects locale-aware; xForwardedFor-Trust
  dokumentiert; Dead-Migration 001 entfernt; README-Baum korrigiert.
  Bewusst NICHT angefasst: report-Toggle-TOCTOU (`active↔reported` ist bereits
  geguardet; sauberer Fix = das zurückgestellte `comment_reports`-Modell).
- **🟠+🟡-Batch (2026-06-24)** — alle 14 Punkte abgearbeitet:
  Layer-Scan TTL-Cache (~60 s); Realtime-WebSocket `new WebSocket()` in
  try/catch + Backoff (rows + account); kein Falsch-Logout mehr
  (`refresh()` nullt nur bei 401/403, `onClose` feuert nur nach erfolgreichem
  `open`); Dashboard-`today` client-only (kein Hydration-Mismatch);
  comments-`migrate`-Script repariert (002→004 idempotent + `--env-file`);
  vote-`myVote` autoritativ aus der DB nachgelesen; users-`total` echte
  Gesamtzahl bei „Jetzt aktiv"; analytics-KPIs per Count-Query statt Sample;
  changelog-Patch-Audit `row.title`; healthCheck-Default `unknown`;
  changelog-Löschdialog `localized()`; GDPR-Export `account.get()` abgefangen
  (Fallback Context-User); NotificationBell Re-Subscribe via `watch`;
  release-please `bootstrap-sha` entfernt.
- **Code-Review Batches A–G**: locale-gebundene Daten; OTP exakter Existenzcheck; Appwrite-Fehler gekapselt (signup/profile/report); Presence-PII zu; Rate-Limit zählt nur Fehlversuche (Mail-Routen weiter pro Request); Storage-Bucket-Allowlist + MIME; GDPR-Self-Delete-Audit; A11y (Consent-Banner, SortableHeader); NotificationBell `<i18n-t>`; Vote-Flicker behoben (Single-Write, autoritative Counts) inkl. Flip-Race/Score-Drift/409; Controversial-Sort über Fenster; Pagination-Tiebreaker; Store-Count-Drift (Phantom-Reply, Hard-Delete-Nachfahren); `assertNotLastAdmin` paginiert; `config.patch` 404-only; `seed-changelog` Limit; Changelog-Patch leerer-Body-Schutz; WhatsNewButton-Sortierung; admin-Middleware `status/statusText`; CI `permissions`+`concurrency`; Dependabot; `@nuxtjs/i18n` als echte Dep; `changelog-draft` `execFileSync`.
- **Kommentar-UI (Reddit-Stil)**: borderless, kompakte Aktionszeile, Edit/Delete/Report hinter ⋯, Antworten ein-/ausklappen, „Alle {x} laden"-Button (löst die verborgenen Kommentare + verwaiste Replies), **unreport** (Melden ⇄ zurückziehen).
- **False Positives (geprüft, kein Fix)**: System-Update-Toast liest Fehler korrekt; Audit-Sort `actorName` / User-Sort `labels` laufen auf 1.9.0 fehlerfrei; keine Prod-Fehler-Leaks (Nitro maskiert ungefangene Fehler).
