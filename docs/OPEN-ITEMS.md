# Offene Punkte

Stand: 2026-06-29. Vollständige, eigenständige Liste offener Themen (für eine
frische Session als Startpunkt nutzbar). Reihenfolge = grobe Priorität.

## 🟠 Mittel — lohnt sich

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

## 🟡 Niedrig

_Alle erledigt (2026-06-24) — siehe „Bereits erledigt"._

## 🔧 Cleanup / Improvements / NITs

- **Status-Codes**: `comments/index.post`, `config.patch`-Create, admin `getRow`/`users.get` werfen 500 statt 4xx (KEIN Leak — Nitro maskiert in Prod —, nur falscher Status).
- **i18n/A11y**: Sidebar-Labels (sidebar/floating/inset) in [DashboardUserMenu.vue](../packages/admin/app/components/DashboardUserMenu.vue) hartkodiert; [AnalyticsTrendChart.vue](../packages/admin/app/components/AnalyticsTrendChart.vue)-SVG ohne `aria-label`; [OtpLoginForm.vue](../packages/core/app/components/auth/OtpLoginForm.vue)-`resend` löscht alten Fehler nicht.
- **Dead Code**: `useSeo.ts`, `useAnalytics.ts` (Composable — Analytics läuft im Plugin), `RowList<T>`-Typ.
- **Duplizierung → in Core/Utils zusammenführen**: Avatar-Auflösung (`authorAvatars.ts` + `userAvatars.ts` + inline in `presence/count.get.ts`), GDPR-Export-Mapper (core + admin), Changelog-Row→DTO (public + admin).
- **Coverage-Lücke**: Feature-Layer (themes/comments/admin) haben kein `typecheck`/`test`-Script → `pnpm -r` überspringt sie.
- **NITs**: `stats.get.ts` legacy `users.list([...])`-Form; `.env.example` totes `NUXT_PUBLIC_APPWRITE_PROJECT_NAME`; `isOutdated` ignoriert Prerelease-Ordering; CI-Actions an floating `@vN`-Tags statt SHA-pinned (Dependabot hält sie aktuell).

## ⏸️ Zurückgestellt — brauchen Design

- **Reply-Notification-Link `/`** + Cross-Layer-Write — [comments/index.post.ts](../packages/comments/server/api/comments/index.post.ts) verlinkt hart auf `/` und schreibt in die `notifications`-Tabelle des Admin-Layers. Sauberer Fix braucht eine Target→URL-Konvention + Event-/Resolver-Hook zur Entkopplung.
- **`total`-Semantik im Comment-Store** — mischt „geladen" vs. „global"; beim *Hide* eines Eltern-Kommentars verwaisen geladene Replies. → `total` server-autoritativ halten. (Das Pagination-/Orphaning-Problem ist durch den „Alle laden"-Button entschärft, aber nicht grundsätzlich gelöst.)
- **Pro-Melder-Report-Modell** — aktuell ein Status-Flag (jeder eingeloggte Nicht-Autor kann melden/zurückziehen). „Richtig": pro User eine Meldung, nur die eigene zurückziehbar, Admin sieht Melder-Anzahl → eigene `comment_reports`-Tabelle.
- **„Bearbeitet"-Indikator** — braucht eine eigene `edited`/`editedAt`-Spalte, da `$updatedAt` auch von Votes/Moderation gebumpt wird.

## 🗺️ Roadmap — bewusst ausgeklammert

- **Phase 17 – Production Deployment**: Prod-Appwrite (Hetzner), Domain, ploi.io-Site, Deploy-Webhook ([deploy.yml](../.github/workflows/deploy.yml) ist Skeleton).
- **Phase 18 – Realtime-Rückbau aufs SDK**: wartet auf Appwrite-Release > 1.9.0 (System-Seite zeigt veraltete Server-Version an → Trigger). Dann `useRealtimeRows` zurück aufs Web-SDK + `usePresence` ergänzen.
- **Backlog**: Themes-Vollausbau (26×11), `packages/billing` (Stripe), E2E-Tests (Playwright) pro App, obsidian-community-concept.
- **Changelog Track 2B**: Appwrite Function für vollautomatische Produkt-Changelog-Drafts (wenn Prod mit öffentlicher Domain steht).
- **Sonstiges**: öffentliche `/changelog`-Vollhistorie-Seite, die 10 gesammelten SaaS-Feature-Ideen (u. a. Embed-Widget).

---

## ✅ Bereits erledigt (Referenz)

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
