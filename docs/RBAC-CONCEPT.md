# Rollen- & Rechte-Konzept (RBAC)

Stand: 2026-06-25. Implementierungsreifes Konzept für ein dashboard-konfigurierbares
Rollen-/Rechtemanagement. Ergänzt [CONCEPT.md](CONCEPT.md) (Architektur) und
[OPEN-ITEMS.md](OPEN-ITEMS.md).

## Getroffene Entscheidungen

1. **Rollen-Umfang:** `admin` + `moderator` (Katalog ist erweiterbar, z. B. `editor` später).
2. **Konfigurierbarkeit:** statische Capability-Matrix **im Code** (versioniert, type-safe);
   **dynamisch im Dashboard ist nur die Zuweisung** Rolle→User.
3. **Geltungsbereich:** globale Rollen über **Appwrite-User-Labels** (keine Teams, kein Multi-Tenant).

## Modell

Drei Ebenen, klar getrennt:

- **Capability** — eine atomare Fähigkeit, gegen die Code gated wird (Code-Identifier, frei wählbar, darf Punkte enthalten). Beispiel `comments.moderate`.
- **Rolle** — ein benanntes Bündel von Capabilities. Wird als **Appwrite-Label** am User gespeichert (Label-Namen sind alphanumerisch: `admin`, `moderator`).
- **Zuweisung** — welcher User welche Rolle(n) hat. Das (und nur das) ist im Dashboard editierbar.

> Die Matrix Rolle→Capabilities ist **nicht** im Dashboard editierbar. Sie ist
> sicherheitskritisch und gehört ins Git-Review, nicht in eine DB-Tabelle.

### Capability-Katalog

| Capability | Bedeutung |
|---|---|
| `dashboard.access` | Dashboard öffnen, Overview/Stats lesen |
| `comments.moderate` | Kommentare ein-/ausblenden, Reports sehen/bearbeiten |
| `users.manage` | User lesen, Rollen/Status setzen, löschen, Sessions beenden, GDPR-Export Dritter |
| `changelog.manage` | Changelog CRUD |
| `system.manage` | System-Info, Self-Update, App-Config-Gates |
| `storage.manage` | Storage-Browser, Orphans löschen |
| `audit.read` | Audit-Log lesen |
| `feed.manage` | Activity-Feed moderieren (Einträge löschen) |

### Rollen → Capabilities

| Rolle | Capabilities |
|---|---|
| `admin` | **alle** (Wildcard) |
| `moderator` | `dashboard.access`, `comments.moderate` |

Ein Moderator kann also: Dashboard + Overview öffnen, gemeldete Kommentare sehen,
aus-/einblenden. Er kann **nicht**: User verwalten, System/Storage/Changelog,
Audit-Log. (Widgets ohne Capability liefern leer/403 — das ist ok, da die Pages
das bereits per `lazy`/`catch` abfangen; capability-abhängiges Ausblenden ist Phase 3.)

## Capability ↔ Endpoint-Mapping

Ersetzt die 23 heutigen `requireAdmin`-Aufrufe. `requireAdmin` bleibt als dünner
Alias `requirePermission(event, 'dashboard.access')` für Kompatibilität, wird aber
pro Route durch die spezifische Capability ersetzt:

| Capability | Routen (`packages/admin/server/api/admin/…` sofern nicht anders) |
|---|---|
| `dashboard.access` | `stats.get`, `analytics.get`, `search.get` |
| `comments.moderate` | `comments/index.get`, `comments/[id]/status.patch` |
| `users.manage` | `users/index.get`, `users/[id]/index.get`, `…/role.patch`, `…/status.patch`, `…/index.delete`, `…/sessions.delete`, `…/export.get` |
| `changelog.manage` | `changelog/index.{get,post}`, `changelog/[id].{patch,delete}` |
| `system.manage` | `system.get`, `system/update.post`, `config.{get,patch}` |
| `storage.manage` | `storage.get`, `storage/[fileId].delete` |
| `audit.read` | `audit.get` |
| `feed.manage` | `packages/feed`: `feed/[id].delete` |

> `search.get` liefert auch User-Namen — bleibt `dashboard.access` (keine E-Mails/PII
> in der Antwort prüfen; sonst auf `users.manage` heben).

## Struktur (Layer-Zuordnung)

Dependency-Richtung bleibt strikt **App → Feature-Layer → core**; core hängt nie von admin ab.

### core (Fundament — neu)
- `shared/types/authz.ts` — `Capability`-Union, `Role`-Union (type-safe, server+client sichtbar).
- `shared/authz.ts` — **die Matrix**: `ROLE_CAPABILITIES`, `ALL_CAPABILITIES`, plus Helfer
  `capabilitiesFor(labels: string[]): Set<Capability>` und `hasCapability(labels, cap): boolean`.
  In `shared/`, damit Server **und** Client (UI-Hiding) dieselbe Quelle nutzen.
- `server/utils/requirePermission.ts` — Auto-Import:
  ```ts
  requirePermission(event, cap): CurrentUser   // 401 ohne User, 403 ohne Capability
  ```
  liest `event.context.user.labels`, löst via `capabilitiesFor` auf. `admin` ⇒ Wildcard.

### admin (Feature-Layer — geändert)
- Alle `requireAdmin`-Aufrufe → `requirePermission(event, '<cap>')` gemäß Tabelle.
- `server/utils/admin.ts` → `requireAdmin` wird Alias auf `requirePermission(event, 'dashboard.access')` (Deprecation-Kommentar).
- `users/[id]/role.patch.ts` → Rollen-Zuweisung (s. u.).
- `app/middleware/admin.ts` → gated auf `hasCapability(auth.user?.labels, 'dashboard.access')` statt `isAdminUser`.
- Dashboard-UI: Rollen-Auswahl (Mehrfach) statt Admin-Toggle; read-only Matrix-Ansicht optional (Phase 3).

### comments (Feature-Layer)
- **Keine Route-Änderung** — die Moderation läuft über den admin-Endpoint
  `comments/[id]/status.patch`. Durch den Wechsel auf `comments.moderate` können
  Moderatoren ihn nutzen, ohne dass comments etwas ändert.

## Rollen-Zuweisung (Endpoint-Redesign)

`PATCH /api/admin/users/[id]/role` — Body wechselt von `{ admin: boolean }` zu
`{ roles: Role[] }` (validiert: Teilmenge der bekannten Rollen).

Labels-Update: `neueLabels = (bestehende Labels − alle Rollen-Labels) ∪ ausgewählte Rollen`
(nicht-Rollen-Labels bleiben erhalten; Set-basiert wie heute).

**Sicherheits-Invarianten** (alle server-seitig erzwungen):
1. **Keine Eskalation:** der Handelnde darf nur Rollen vergeben, deren Capability-Menge
   ⊆ seiner eigenen ist. (Ein Moderator könnte ohnehin nicht hierher — `users.manage`
   ist admin-only — aber die Regel ist zukunftssicher.)
2. **Last-Admin-Garantie:** Entzug von `admin` beim letzten Admin → 400 `last_admin`
   ([assertNotLastAdmin](../packages/admin/server/utils/admins.ts) bleibt, prüft weiter das `admin`-Label).
3. **Kein Selbst-Lockout:** eigene `admin`-Rolle nicht entziehbar (wie heute).

## Audit & i18n

- **Audit:** neue Aktion `user.roles_updated` mit `metadata: { before, after }` (Rollen-Diff).
  Bestehende `user.role_granted/revoked` bleiben für Alt-Logs gültig.
- **i18n:** Keys für Rollennamen (`admin.roles.admin`, `admin.roles.moderator`) und
  Capability-Beschreibungen (Matrix-Ansicht) in core- bzw. admin-Locales, DE+EN.

## Migration

**Keine Daten-Migration.** Das bestehende `admin`-Label ist exakt die `admin`-Rolle.
Reiner Code-Change. Kein Migrations-Script nötig.

## Phasen

1. ✅ **Refactor (erledigt):** core-`requirePermission` + Matrix; `requireAdmin`
   @deprecated; alle 23 admin-Gates auf spezifische Capabilities; Client-Middleware
   auf `dashboard.access`. Verhalten identisch (nur `admin` existierte).
2. ✅ **Moderator (erledigt):** Rolle in der Matrix; Moderations-Gates
   (`comments.moderate`); `role.patch` → Mehrfachrollen (`{ roles: Role[] }`) mit
   Eskalations-/Last-Admin-/Selbst-Schutz; Dashboard-Rollen-Editor (Detailseite);
   UserMenu + Middleware auf `dashboard.access`; Audit `roles_updated`; i18n DE+EN.
3. ✅ **Sidebar-Gating (erledigt):** Sidebar-Links (oben + unten) und die Admin-
   Bereich-Tabs sind capability-gefiltert; Dashboard-Pages tragen
   `requiredCapability` und werden zusätzlich zur `dashboard.access`-Hürde von der
   `admin`-Middleware geprüft (Direkt-URL → 403). Ein Moderator sieht nur
   Overview + Kommentare und kommt nirgends sonst hin.
4. **Offen/optional:** Rolle `editor` (`changelog.manage`) — braucht noch eine
   capability-bewusste Landeseite für den „Admin"-Bereich (der Nav-Link zeigt
   aktuell auf den audit-gegateten Index, ein reiner Editor käme so nicht zum
   Changelog); read-only Matrix-Ansicht im Dashboard; Verallgemeinerung von
   „letzter Träger" auf weitere kritische Capabilities.

## Bewusst ausgeklammert

- **Runtime-editierbare Rechte-Matrix** (DB-Tabelle + UI) — Eskalations-/Audit-/Caching-Risiken,
  Rechte-Stand außerhalb des Git-Reviews. Statische Matrix bleibt.
- **Appwrite Teams / Multi-Tenant** — erst bei org-/workspace-scoped Anforderungen.
- **Per-User-Overrides** (einzelne Capability zusätzlich zur Rolle) — Rollen reichen vorerst.
