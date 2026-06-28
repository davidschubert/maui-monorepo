# Moderation-Layer & Layer-Grenzen — Design-Vorschlag

Stand: 2026-06-27. **Vorschlag, kein Code.** Entstanden aus dem Abgleich des externen
„Finaler Architektur-Report"-Dokuments gegen den realen Projektstand. Zwei externe
Ideen wurden am bestehenden Projekt zu konkreten Lösungen umgeformt (Leitplanken-Prinzip):

1. **Reports von Kommentaren loslösen** → generischer `moderation`-Layer („etwas melden" als eigenes Produkt).
2. **Verboten/Erlaubt pro Layer** → Layer-Grenzen-Matrix, *dokumentiert + technisch erzwungen*.

Beide hängen zusammen: Die Matrix (Teil A) **entscheidet**, wo der Moderation-Layer (Teil B)
leben darf. Moderation ist zugleich der erste Praxistest der vertrag-basierten Durchsetzung.

Ergänzt [CONCEPT.md](CONCEPT.md) (A14), [RBAC-CONCEPT.md](RBAC-CONCEPT.md), [OPEN-ITEMS.md](OPEN-ITEMS.md).

**Getroffene Entscheidungen (2026-06-27):** Layer-Name `moderation` · eigene Capability
`reports.moderate` (`<domain>.<verb>` wie der bestehende Katalog) · Reihenfolge: erst
Matrix + ESLint-Backstop, dann Layer-Skelett, dann comments auf den Vertrag umstellen.

---

## Teil A — Layer-Grenzen-Matrix

### A.1 Die Matrix

Jeder Layer ist ein **Vertrag**. Eine Datei erbt den Vertrag ihres Layers — Regeln stehen
auf Layer-Ebene, nicht pro Component (sonst veralten sie beim Verschieben).

| Layer | darf besitzen | darf nie | Abhängig von |
|---|---|---|---|
| `core` | Auth, Appwrite-Client-Factories, RBAC-Matrix, SSR-Session, Base-UI, Shared-Utils | Feature-Domäne, eigene Tables | — |
| `system` *(neu, optional)* | `audit_logs`, `app_config`, `notifications`, `presence` (cross-cutting Infra-Tables) | Feature-Domäne, UI-Welt | core |
| `moderation` *(neu)* | `reports`-Table, Melde-Erfassung + Queue + Status-Lifecycle, generische Melde-UI | Domänen-Wissen (Comment-/User-Interna), Konsequenz-Logik | core |
| `themes` | Design-Tokens, CSS, Theme-Switcher, Color-Mode | Appwrite, Auth, Business-Logik | — (nur `@nuxt/ui`) |
| `comments` | `comments`/`comment_votes`-Tables, Comment-API/UI/Store | Admin-Logik, fremde Feature-Tables, Resolution anderer Domänen | core, moderation |
| `admin` | `changelog`-Table, Dashboard/Moderation-Queue-UI + -API | Feature-interne Imports (Code), Feature-Domänen-Logik | core, moderation, (system) |

> **Offene Vorfrage (Teil A):** `system`-Layer ist die saubere Antwort auf die heutige
> Inversion (core liest/schreibt admin-eigene Tables: `audit_logs`, `app_config`,
> `notifications`, `presence` — verifiziert: core referenziert sie, admin legt sie an).
> Das ist eine eigene Entscheidung und blockt Moderation **nicht**. Hier nur als Zielbild gelistet.

### A.2 Durchsetzung — zweistufig, ehrlich

**Befund:** Die Layer importieren sich heute **nicht** explizit (kein `@maui/*`-Import, kein
`../../`-Pfad). Cross-Layer-Code läuft über **Nuxt-Auto-Import** über die `extends`-Kette.
Die reale admin→comments-Kopplung ist **String-basiert** (`tableId: 'comments'`, 9×).
→ Eine `no-restricted-imports`-Regel allein wäre **Theater**: sie verbietet Importe, die
es nicht gibt, und übersieht die Kopplung, die es gibt.

Deshalb **zwei Stufen**:

**Stufe 1 — architektonisch (Primär):** Implizite Kopplung in **explizite Verträge** überführen.
Statt dass `admin` den String `'comments'` kennt, exportiert der Eigentümer-Layer eine
typisierte Konstante/einen Contract, den der Konsument **explizit importiert**. Damit wird
die Abhängigkeit (a) sichtbar, (b) typsicher, (c) für Stufe 2 überhaupt erst lint-bar.
Moderation (Teil B) ist genau so gebaut: comments importiert `useReport`/`<ReportButton>`
explizit aus `moderation`, moderation importiert nichts aus comments.

**Stufe 2 — ESLint `no-restricted-imports` (Backstop):** Verhindert *künftige* verbotene
explizite Kopplung. An die reale Flat-Config (`eslint.config.mjs`) angehängt, per `files`-Scope
pro Layer:

```js
// eslint.config.mjs — zusätzliche .append()-Blöcke, Skizze
.append({
  files: ['packages/themes/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [
    { group: ['*appwrite*', '@maui/*'], message: 'themes ist rein visuell — keine Appwrite/Feature-Imports.' },
  ] }] },
})
.append({
  files: ['packages/admin/**', 'packages/comments/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [
    { group: ['@maui/comments', '@maui/admin', '@maui/themes'],
      message: 'Feature-Layer importieren keine anderen Feature-Layer. Nur core/moderation als Fundament.' },
  ] }] },
})
.append({
  files: ['packages/moderation/**', 'packages/core/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: [
    { group: ['@maui/comments', '@maui/admin', '@maui/themes', '@maui/moderation'],
      message: 'Fundament-Layer dürfen nicht von Features abhängen.' },
  ] }] },
})
```

> Grenze von Stufe 2: Auto-Import-Kopplung (admin ruft eine comments-Composable ohne `import`)
> und String-Kopplung sieht ESLint nicht. Genau dafür ist Stufe 1 die eigentliche Lösung;
> Stufe 2 hält die Tür zu, sobald jemand doch explizit importieren will.

---

## Teil B — Moderation-Layer (`packages/moderation`)

### B.1 Idee

„Etwas melden" als eigenständiges, domänen-agnostisches Produkt. Es kennt nur
`targetType` + `targetId` — exakt das polymorphe Muster, das `comments` bereits nutzt.
Damit ist es kein Fremdkörper, sondern wendet ein bestehendes Projekt-Pattern wieder an.

Der Name `moderation` (statt `reporting`) ist bewusst gewählt: er lässt Raum, später das
**Resolver-Registry** (die Zuordnung „welche Konsequenz pro Target-Typ") mit aufzunehmen.
Der **v1-Scope bleibt dennoch Erfassung + Queue** — die eigentliche Aktion bleibt in den Domänen.

**Position im Stack:** `extends: ['../../packages/themes', '../../packages/admin', '../../packages/comments', '../../packages/moderation', '../../packages/core']`
— knapp über core, weil Moderation **Fundament für** comments/admin ist und selbst nur von core abhängt.

**Abhängigkeitsgraph (azyklisch):**
```
comments ─┐
admin   ──┼─→ moderation ─→ core
          │      (kennt comments/users NICHT)
users(*)──┘
```

### B.2 Verantwortung — Erfassung & Queue, NICHT Konsequenz

| Moderation besitzt | Moderation besitzt NICHT |
|---|---|
| `reports`-Table (polymorph) | „Kommentar ausblenden" / „User sperren" (bleibt in comments/admin) |
| `POST /api/reports` (melden, eine Meldung pro User/Target) | Wissen über Comment-/User-Felder |
| `GET /api/reports` (Queue, gefiltert nach targetType/status) | Domänen-spezifische Reason-Kataloge (kommen vom Konsumenten) |
| Status-Lifecycle: `open → reviewing → resolved → dismissed` | Routing/URL zum Target (Resolver-Sache des Konsumenten) |
| Generische UI: `<ReportButton>`, `useReport()` | |

### B.3 Schema — `reports`

```txt
reports
  $id
  reporterId      VARCHAR  (wer meldet — aus Session)
  targetType      VARCHAR  ('comment' | 'user' | … — offener String, kein harter Enum)
  targetId        VARCHAR  (polymorpher Anker)
  reason          VARCHAR  (Kategorie; erlaubte Werte liefert der Konsument via Schema)
  note            VARCHAR? (optionaler Freitext des Melders)
  status          VARCHAR  ('open' | 'reviewing' | 'resolved' | 'dismissed')
  resolvedBy      VARCHAR? (Moderator-User-ID)
  resolution      VARCHAR? ('hidden' | 'deleted' | 'blocked' | 'no_action' | …)
  $createdAt / $updatedAt
```

Indizes:
```txt
target            [targetType, targetId]   → alle Meldungen zu einem Target + Zähler
reporter_target   [reporterId, targetType, targetId]  UNIQUE → eine Meldung pro User/Target
status            [status]                 → Queue („offene Meldungen")
```

**Das löst die heutige Schwäche** (Status-Flag `active↔reported`, jeder kann togglen):
- Eine Meldung **pro User pro Target** (UNIQUE-Index erzwingt es).
- Nur die **eigene** Meldung zurückziehbar.
- Admin sieht **Melder-Anzahl** (Count über `target`-Index) statt eines binären Flags.

Permissions: create `users()`, read nur Moderatoren (server-seitig via `requirePermission`,
neue Capability `reports.moderate` → s. B.6).

### B.4 Der Vertrag (so integriert sich Moderation in andere Layer)

**Konsument-Seite (comments, users-Card, …) — explizit, lint-bar:**
```ts
// in einer comments-Component — EXPLIZITER Import aus moderation (Stufe-1-Vertrag)
import { ReportButton } from '#moderation/components'   // o. Auto-Import-Component <ReportButton>
// <ReportButton target-type="comment" :target-id="comment.$id" :reasons="COMMENT_REASONS" />
```
Der Konsument liefert seinen **eigenen Reason-Katalog** (Comment: spam/harassment/offtopic;
User: impersonation/spam/abuse) — Moderation bleibt katalog-agnostisch.

**Resolution-Seite (v1, pragmatisch):** Die Admin-Moderations-Queue liest `GET /api/reports`,
gruppiert nach `targetType`, und ruft die **bestehende** Domänen-Aktion auf:
- `targetType: 'comment'` → vorhandener `PATCH /api/admin/comments/[id]/status` (hidden/active)
- `targetType: 'user'` → vorhandener `PATCH /api/admin/users/[id]/status` (block)
- danach `reports` der Gruppe auf `resolved` + `resolution` setzen.

→ **Kein** Runtime-Resolver-Registry in v1. Die Zuordnung `targetType → Aktion` lebt in der
Admin-Queue (ein Konsument, eine Map). Ein generisches Resolver-Registry ist die spätere
Verallgemeinerung (gleiche Logik wie die zurückgestellte Admin-Module-Registry) — erst ab
dem 3. Target-Typ sinnvoll. Der Layer-Name `moderation` ist dafür schon vorbereitet.

### B.5 Migration & Eigentum

- Eine idempotente Migration `packages/moderation/scripts/migrations/001-reports.ts`
  (Muster wie comments: 409→skip, Spalten auf `available` pollen vor Indizes, `--env-file`).
- **Keine** Daten-Migration des heutigen `reported`-Status nötig: Beim Umstieg startet die
  `reports`-Tabelle leer; der `status`-Wert `reported` am Kommentar bleibt als
  *abgeleitete Anzeige* erhalten (oder wird aus `reports` berechnet — s. B.7).

### B.6 Capability/RBAC-Anbindung

- Neue Capability **`reports.moderate`** im Katalog (`core/shared/authz.ts` + `shared/types/authz.ts`),
  gemappt auf `admin` (alle, via Wildcard) + `moderator`. Konsistent mit RBAC-CONCEPT
  (Matrix im Code, Zuweisung dynamisch über Labels) und mit dem `<domain>.<verb>`-Schema
  des bestehenden Katalogs (`comments.moderate`, `users.manage`, …).
- Der heutige `comments.moderate`-Gate am Comment-Moderations-Endpoint bleibt, bis User-Reports
  live sind; danach wandert die Report-Queue auf `reports.moderate`.

### B.7 Wechselwirkung mit dem Comment-Status (bewusst entkoppeln)

Heute mischt der Comment-`status` Melde- und Moderationszustand. Mit `reports` als eigener
Quelle wird klarer:
- `reported` als Comment-Status entfällt mittelfristig → „ist gemeldet" = „es gibt offene
  `reports` mit targetType=comment, targetId=$id". Der Comment behält nur
  `active | hidden | deleted` (echte Sichtbarkeit), die Melde-Info kommt aus `reports`.
- Das ist ein **separater, optionaler Folgeschritt** — nicht Voraussetzung für den Layer.

---

## Abgrenzung: was NICHT in diesem Vorschlag steckt

- **Comment-Schema `rootId`/`depth`/`editedAt`** — eigene, comment-interne Verbesserung
  (löst Threading-/Orphan-/„bearbeitet"-Themen). Bewusst getrennt, kein Moderation-Thema.
- **`system`-Layer** — eigene Entscheidung (Teil A.1), nötig für die core↔admin-Inversion,
  aber unabhängig von Moderation umsetzbar.
- **Runtime-Resolver-Registry** für Report-Konsequenzen — erst ab 3. Target-Typ.

## Umsetzungs-Reihenfolge (beschlossen)

1. ✅ **Matrix + ESLint-Backstop** (Teil A, 2026-06-27) — Matrix in [CONCEPT.md](CONCEPT.md) (A14)
   + Pointer in CLAUDE.md, ESLint-Regeln für die bestehenden Layer in `eslint.config.mjs`.
2. ✅ **`packages/moderation`-Layer** (2026-06-27) — Layer verdrahtet (in App-`extends` vor core),
   `reports.moderate`-Capability in core, `shared/types/report.ts`, `schemas/report.ts`,
   Migration `001-reports.ts`, `POST/DELETE/GET /api/reports`, `useReport()` + `<ReportButton>`.
   Lint + Typecheck grün. **Offen: Migration auf der Appwrite-Instanz ausführen** (Migrations-Key).
3. ✅ **comments auf den Vertrag umgestellt** (2026-06-27) — Migration ausgeführt + verifiziert.
   - User-Melden: `<ReportButton target-type="comment">` ersetzt den `comment.status`-Toggle;
     eigener Melde-Status via `GET /api/comments` (`myReports`, über moderation-Util
     `myOpenReportTargetIds` — expliziter Vertrag, kein direkter `reports`-Zugriff).
   - Alte Route `comments/[id]/report.post.ts` + `store.toggleReport` entfernt.
   - Admin: „reported"-Filter + Dashboard-KPI lesen offene Reports (`openReportsByTarget`)
     statt `comment.status='reported'`; Report-Count-Badge in der Moderations-Queue.
   - Lint + Typecheck grün.

### Folgeschritte — erledigt (2026-06-27)

- ✅ **Report-Lifecycle:** `POST /api/reports/resolve` (ziel-basiert, `reports.moderate`).
  Ausblenden schließt die offenen Meldungen automatisch (`resolution='hidden'`); zusätzliche
  Admin-Aktion „Meldungen erledigen" (`resolution='no_action'`, Kommentar bleibt sichtbar).
- ✅ **`'reported'` aus `CommentStatus` entfernt** (`active | hidden | deleted`); alle
  Edit/Vote/Realtime/Badge-Nutzungen angepasst; 4 Legacy-Kommentare in der DB von
  `reported` → `active` normalisiert (Daten-Cleanup, 0 verbleibend).
- ✅ **Tote i18n-Keys entfernt** (`comments.item.report/unreport/reported/…Toast`,
  `admin.moderation.status.reported`).

### Bewusst offen (minor)

- **Fenster-Cap** `openReportsByTarget`/`resolve` = 500 offene Meldungen pro Target-Typ —
  Ausnahmefall, dokumentiert.
- **KPI-Semantik:** Dashboard zählt offene Reports, Queue-Header distinkte Kommentare —
  kleiner, bewusster Unterschied.
- **Per-Report-`PATCH`** nicht gebaut — das ziel-basierte `resolve` deckt die UI ab
  (erst nötig, wenn einzelne Meldungen getrennt behandelt werden sollen).
