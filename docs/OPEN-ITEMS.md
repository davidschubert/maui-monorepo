# Offene Punkte

Stand: 2026-06-23. Gepflegte Liste offener Themen. Erledigte Punkte des
Code-Review-Durchlaufs (Batches A–G) stehen unten als Referenz.

## ⏸️ Zurückgestellt — brauchen Design, kein Quick-Fix

- **Reply-Notification-Link `/`** ([comments/index.post.ts](../packages/comments/server/api/comments/index.post.ts))
  Antwort-Benachrichtigungen verlinken hart auf `/`. Es gibt keine generische
  Target→URL-Zuordnung (Targets sind bewusst generisch: `targetId`/`targetType`).
  Sauberer Fix braucht eine URL-Konvention oder einen Event-/Resolver-Hook.
  Außerdem: der Comments-Layer schreibt in die `notifications`-Tabelle des
  Admin-Layers (Cross-Layer-Kopplung) — besser über ein Event entkoppeln.

- **`total`-Semantik im Comment-Store** ([useCommentStore.ts](../packages/comments/app/stores/useCommentStore.ts))
  `total` mischt „geladen" und „global" (Server-Count vs. lokale +1/−1). Über
  lange Realtime-Sessions kann es leicht driften. Außerdem: beim *Hide* eines
  Eltern-Kommentars verwaisen geladene Replies (werden unsichtbar, bleiben aber
  in `total`). Tiefere Datenmodell-Frage — am besten `total` server-autoritativ
  halten und periodisch nachziehen.

## 🗺️ Roadmap — bewusst ausgeklammert

- **Phase 17 – Production Deployment**: Prod-Appwrite (Hetzner), Domain,
  ploi.io-Site, Deploy-Webhook aktivieren ([deploy.yml](../.github/workflows/deploy.yml) ist Skeleton).
- **Phase 18 – Realtime-Rückbau aufs SDK**: wartet auf Appwrite-Release > 1.9.0
  (die System-Seite zeigt veraltete Server-Version an → Trigger). Dann
  `useRealtimeRows` zurück aufs Web-SDK + `usePresence` ergänzen.
- **Backlog**: Themes-Vollausbau (26×11), `packages/billing` (Stripe),
  E2E-Tests (Playwright) pro App, obsidian-community-concept.
- **Changelog Track 2B**: Appwrite Function für vollautomatische Produkt-Changelog-
  Drafts (wenn Prod mit öffentlicher Domain steht).
- **Sonstiges**: öffentliche `/changelog`-Vollhistorie-Seite, die 10 gesammelten
  SaaS-Feature-Ideen (u. a. Embed-Widget).

---

## ✅ Erledigt im Code-Review-Durchlauf (Referenz)

- **Core**: locale-gebundene Daten; OTP exakter Existenzcheck; Appwrite-Fehler
  gekapselt (signup/profile/report); Presence-PII zu; Rate-Limit zählt nur
  Fehlversuche (Mail-Routen weiter pro Request); Storage-Bucket-Allowlist + MIME;
  GDPR-Self-Delete-Audit; A11y (Consent-Banner, SortableHeader); NotificationBell
  via `<i18n-t>`.
- **Comments**: Vote-Flicker behoben (Single-Write, autoritative Counts) inkl.
  Flip-Race/Score-Drift/409-Race; Controversial-Sort über Fenster; stabiler
  Pagination-Tiebreaker; Store-Count-Drift (Phantom-Reply, Hard-Delete-Nachfahren).
- **Admin**: `assertNotLastAdmin` paginiert alle User; `config.patch` 404-only;
  `seed-changelog` Limit; Changelog-Patch leerer-Body-Schutz; WhatsNewButton-
  Sortierung; admin-Middleware `status/statusText`.
- **CI/Tooling**: CI `permissions` + `concurrency`; Dependabot; `@nuxtjs/i18n`
  als echte Dep (Phantom-Dep); `changelog-draft` `execFileSync`.
- **False Positives (geprüft, kein Fix)**: System-Update-Toast liest Fehler
  korrekt; Audit-Sort `actorName` / User-Sort `labels` laufen auf 1.9.0 fehlerfrei.
