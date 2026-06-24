# Offene Punkte

Stand: 2026-06-24. Vollständige, eigenständige Liste offener Themen (für eine
frische Session als Startpunkt nutzbar). Reihenfolge = grobe Priorität.

## 🟠 Mittel — lohnt sich

1. **Layer-Scan ohne Cache** — [system.get.ts](../packages/admin/server/api/admin/system.get.ts) ruft [layers.ts](../packages/admin/server/utils/layers.ts) `layerBreakdown` bei JEDEM Request → dutzende rekursive `readdirSync` über den Monorepo (blockiert den Event-Loop), obwohl npm/GitHub daneben 1 h gecacht sind. → kurzer TTL-Cache (im Modul-Scope, ~60 s).
2. **Realtime-WebSocket ohne try/catch** — [useRealtimeRows.ts](../packages/core/app/composables/useRealtimeRows.ts), [useRealtimeAccount.ts](../packages/core/app/composables/useRealtimeAccount.ts): `new WebSocket()` kann synchron werfen (CSP/mixed-content) → Fehler fliegt ungefangen, Reconnect-Loop stirbt. → `connect()` in try/catch, im catch Backoff-Reconnect.
3. **Falsche-Logout-Kette** — [useAuthStore.refresh()](../packages/core/app/stores/useAuthStore.ts) nullt den User bei JEDEM Fetch-Fehler (nicht nur 401) + [realtime-account.client.ts](../packages/core/app/plugins/realtime-account.client.ts) `onClose` feuert bei JEDEM Socket-Close → ein Netz-Blip kann „Sitzung widerrufen" + Redirect auslösen. → `refresh()` nur bei 401/403 nullen; `onClose`/`verify` nur nach erfolgreichem `open` bzw. nur bei echten Auth-Fehlern.
4. **Dashboard-`today` Hydration-Mismatch** — [dashboard/index.vue](../packages/admin/app/pages/dashboard/index.vue): `new Date().toLocaleDateString()` wird im SSR gerendert → TZ/Mitternacht-Differenz Server↔Client. → `ClientOnly`/`import.meta.client`.
5. **Comments-`migrate`-Script kaputt** — [comments/package.json](../packages/comments/package.json): zeigt auf die getombstonte Migration 001 + ohne `--env-file` → bricht immer mit Exit 1 ab. → auf aktuelle Migration(en) + `--env-file=../../apps/reddit-comments/.env` umbiegen.

## 🟡 Niedrig

6. **vote `myVote`** kann bei Same-User-Doppelklick (toggle/flip) vom autoritativen Count abweichen → eigenen Vote nach dem Count-Recompute aus der DB neu lesen. [vote.post.ts](../packages/comments/server/api/comments/[id]/vote.post.ts)
7. **users `total`** bei Sort „Jetzt aktiv" auf 500 (FETCH_CAP) geklemmt → Pagination/Anzeige falsch jenseits 500. [users/index.get.ts](../packages/admin/server/api/admin/users/index.get.ts)
8. **analytics `SAMPLE=200`** untercountet KPI-Deltas bei breiten Zeiträumen/aktiven Tagen → in-range-Totals per `Query.limit(1)`-Count statt Sample. [analytics.get.ts](../packages/admin/server/api/admin/analytics.get.ts)
9. **changelog-Patch-Audit** loggt leeren `targetName` bei Teil-Edits → `row.title` nutzen. [[id].patch.ts](../packages/admin/server/api/admin/changelog/[id].patch.ts)
10. **healthCheck** defaultet bei leerer `statuses`-Liste auf `pass` statt `unknown`. [system.get.ts](../packages/admin/server/api/admin/system.get.ts)
11. **changelog-Löschdialog** zeigt deutschen Titel auf EN-UI → `localized()`. [changelog.vue](../packages/admin/app/pages/dashboard/admin/changelog.vue)
12. **GDPR-Export** `account.get()` ungefangen im `Promise.all` → ein Blip 500t den ganzen Export. [export.get.ts](../packages/core/server/api/auth/export.get.ts)
13. **NotificationBell** abonniert nur bei Mount; kein Re-Subscribe bei Login-nach-Mount → `watch(() => auth.user?.$id, …, { immediate: true })`. [NotificationBell.vue](../packages/core/app/components/NotificationBell.vue)
14. **release-please** stale `bootstrap-sha` (no-op, kann künftige History-Walk verwirren) → entfernen. [release-please-config.json](../release-please-config.json)

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

- **Code-Review Batches A–G**: locale-gebundene Daten; OTP exakter Existenzcheck; Appwrite-Fehler gekapselt (signup/profile/report); Presence-PII zu; Rate-Limit zählt nur Fehlversuche (Mail-Routen weiter pro Request); Storage-Bucket-Allowlist + MIME; GDPR-Self-Delete-Audit; A11y (Consent-Banner, SortableHeader); NotificationBell `<i18n-t>`; Vote-Flicker behoben (Single-Write, autoritative Counts) inkl. Flip-Race/Score-Drift/409; Controversial-Sort über Fenster; Pagination-Tiebreaker; Store-Count-Drift (Phantom-Reply, Hard-Delete-Nachfahren); `assertNotLastAdmin` paginiert; `config.patch` 404-only; `seed-changelog` Limit; Changelog-Patch leerer-Body-Schutz; WhatsNewButton-Sortierung; admin-Middleware `status/statusText`; CI `permissions`+`concurrency`; Dependabot; `@nuxtjs/i18n` als echte Dep; `changelog-draft` `execFileSync`.
- **Kommentar-UI (Reddit-Stil)**: borderless, kompakte Aktionszeile, Edit/Delete/Report hinter ⋯, Antworten ein-/ausklappen, „Alle {x} laden"-Button (löst die verborgenen Kommentare + verwaiste Replies), **unreport** (Melden ⇄ zurückziehen).
- **False Positives (geprüft, kein Fix)**: System-Update-Toast liest Fehler korrekt; Audit-Sort `actorName` / User-Sort `labels` laufen auf 1.9.0 fehlerfrei; keine Prod-Fehler-Leaks (Nitro maskiert ungefangene Fehler).
