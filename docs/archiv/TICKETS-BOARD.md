# Tickets-Board — Trello-artiges Kanban als eigener Feature-Layer

Stand: 2026-07-08 · Status: P1 ✅ + Review-Feinschliff ✅ · P2 ✅ · Leitplanke:
Trello (Screenshots David), bewusst am realen Projekt umgeformt.

## 1. Einordnung & Motivation

Die Dashboard-„Roadmap" (Anzeige-Kopie in `maui.roadmap`, Seite im admin-Layer)
wird durch ein echtes, interaktives **Ticket-Board** ersetzt — ein
eigenständiger Feature-Layer `packages/tickets`. Das Board ist das
Arbeits-Werkzeug für den Betreiber (Admins + Moderatoren): Feedback sichten,
Tickets planen, Umsetzung verfolgen — und Tickets als **Claude-Code-taugliches
Markdown** exportieren.

**Planungs-Wahrheit bleibt `docs/GOALS.md` + `docs/plans/*`** — das Board ist
das operative Tagesgeschäft (Feedback → Ticket → Umsetzung), nicht die
Architektur-Roadmap.

## 2. Architektur (A14-konform)

- **`packages/tickets`** — Feature-Layer, besitzt die Tables `ticket_lists` +
  `tickets` (Regel 3: eigenes Datenmodell, nie Core). Extendet den Core nicht;
  die App komponiert.
- **Core (additiv):** Capability `tickets.manage` — admin UND moderator
  (Mitglieder auf Karten sind per Anforderung nur Admins/Mods).
- **Dashboard-Nav:** via `maui.admin.modules`-Registry (expliziter Vertrag),
  Route `/dashboard/tickets`, Icon `i-ph-kanban`.
- **Kein** Import von feedback/comments im tickets-Layer — Integration läuft
  später über die APP (Komposition, wie `#comments`-Slot bei posts/events).
- **GDPR:** eigener UserDataContributor (createdBy/Members exportieren,
  bei Löschung pseudonymisieren/entfernen).
- Admin-Roadmap-Seite + `maui.roadmap`-Config werden entfernt (Board ersetzt
  sie; die Inhalte waren Anzeige-Kopie).

## 3. Datenmodell

**`ticket_lists`** (rowSecurity false; Table-Read für `label:admin` +
`label:moderator` → Realtime für Operatoren; Writes NUR über Server-Routen):

| Spalte | Typ | Zweck |
|---|---|---|
| title | varchar 100 | Listen-Titel (User-Daten, umbenennbar) |
| position | float | Sortierung (Midpoint-Insertion) |

**`tickets`** (Permissions identisch):

| Spalte | Typ | Zweck |
|---|---|---|
| listId | varchar 36 | Zuordnung zur Liste |
| title | varchar 300 | Headline |
| description | varchar 10000 | Markdown (Core-Sink `MarkdownContent`, XSS-sicher) |
| label | varchar 12 | '' \| idea \| issue \| other |
| priority | varchar 8 | '' \| low \| medium \| high |
| effort | varchar 12 | '' \| easy \| medium \| hard \| very_hard |
| startAt / dueAt | datetime | Start/Fälligkeit (Erinnerungen: P4) |
| checklist | varchar 3000 | JSON `[{ text, done }]` |
| membersJson | varchar 800 | JSON `[{ id, name }]` (nur Admins/Mods) |
| status | varchar 8 | open \| done (Haken wie Trello, unabhängig von der Liste) |
| doneAt | datetime | Abschluss-Zeitpunkt |
| position | float | Sortierung innerhalb der Liste |
| feedbackId | varchar 36 | Herkunft (P2-Ingestion), '' = manuell |
| createdBy / createdByName | varchar 36/255 | Ersteller |

Zeilenbudget (MariaDB/utf8mb4, ≤ ~15k Zeichen): 10000 + 3000 + 800 + Rest ≈ 14,5k ✓.
Indizes: `tickets.idx_list (listId, position)`, `tickets.idx_status (status)`,
`ticket_lists.idx_position (position)`.

**Seed (Migration, nur bei leerer Tabelle):** „Neue Tickets", „Als nächstes
dran", „Jetzt im Gange", „Wartet auf Freigabe", „Erledigt", „Zurückgestellt" —
Listen sind DATEN (umbenennbar/verschiebbar/löschbar), keine Enum-Semantik im
Code. KEINE „Neues Feedback"-Liste (Entscheidung 2026-07-08): Feedback bleibt
in der Feedback-Verwaltung; die P2-Aktion „Als Ticket übernehmen" legt direkt
in „Neue Tickets" an. „Archivieren" = Karte in die letzte Liste verschieben
ist bewusst NICHT hart verdrahtet — der User zieht in „Zurückgestellt".

## 4. API (alle Routen: `requirePermission(event, 'tickets.manage')`)

- `GET  /api/tickets/board` → `{ lists, tickets }` (beide positionssortiert, explizite Limits)
- `POST /api/tickets/lists` `{ title }` → ans Ende
- `PATCH/DELETE /api/tickets/lists/:id` (title/position; DELETE nur leer → sonst 409)
- `POST /api/tickets/lists/:id/duplicate` (Liste + Karten kopieren)
- `POST /api/tickets/lists/:id/sort` `{ by: createdDesc | createdAsc | alpha }` (Positionen neu schreiben)
- `POST /api/tickets` (create) · `PATCH /api/tickets/:id` (Felder inkl. Move `listId`+`position`, `status`)
- `DELETE /api/tickets/:id` · `POST /api/tickets/:id/duplicate`
- `GET  /api/tickets/assignable` → Admins+Mods `[{ id, name }]` (Admin-Client, users.list nach Labels)

Positionen: Float-Midpoint (`(prev+next)/2`), neue ans Ende (`max+1000`);
Sort-Route normalisiert. Kein Rate-Limit-Bucket nötig (Operator-only).

## 5. UI/UX

- **Board** (`/dashboard/tickets`): horizontal scrollende Spalten (Trello-
  Layout), Listen-Header mit Titel (Inline-Edit), **Karten-Zähler**, Aktionen-
  Menü (UDropdownMenu): Karte hinzufügen, umbenennen, kopieren, verschieben
  (Position), sortieren, löschen.
- **Drag & Drop nativ** (HTML5 draggable/dragover/drop, keine neue Dependency):
  Karten zwischen/innerhalb Listen mit Einfüge-Indikator; Listen am Header
  ziehen. Optimistic Update + PATCH; Realtime (geteilte JWT-SDK-WS auf beide
  Tables) refresht debounct — Board bleibt in allen offenen Fenstern synchron.
- **Karten-Modal** (UModal, Deep-Link `?ticket=<id>` = teilbar): Titel, Liste,
  Label/Priorität/Aufwand (Selects), Start/Fällig (datetime), Beschreibung als
  Markdown (Editieren + gerenderte Vorschau via `MarkdownContent`,
  ContentClamp bei langen Texten), Checkliste (Subtasks, Fortschritt auf der
  Karte), Mitglieder (Admins/Mods, beitreten = sich selbst zuweisen),
  Aktionen: Erledigt-Toggle, Kopieren, Löschen, **„Für Claude Code kopieren"**
  (Markdown in Zwischenablage) + **„Als .md herunterladen"**.
- Karten-Badges: Label-Farbe, Priorität, Fällig (rot bei überfällig),
  Checklist-Fortschritt, Mitglieder-Initialen, grüner Haken bei done.

### Markdown-Export (Claude-Code-Format)

Kein md-File je Ticket auf Platte (DB bleibt die einzige Wahrheit — Dateien
würden divergieren); Export wird on demand generiert:

```md
# <Titel>
**Typ:** Issue · **Priorität:** Hoch · **Aufwand:** Mittel · **Fällig:** 2026-07-10
**Liste:** Als nächstes dran · **Ticket:** https://…/dashboard/tickets?ticket=<id>

## Aufgabe
<Beschreibung, Markdown 1:1>

## Checkliste
- [ ] …

## Kontext
- Projekt: maui-monorepo (Nuxt 4 Layer-Architektur, Appwrite self-hosted, TablesDB)
- Konventionen: CLAUDE.md · Architektur: docs/CONCEPT.md
- Erst grün (lint/typecheck), dann fertig melden; paketweise mit Check-in.
```

## 6. Entscheidungen (fixiert)

1. **Layer-Name** `packages/tickets`, Tables `ticket_lists`/`tickets`.
2. **DnD nativ** statt sortablejs/vuedraggable — keine neue Dependency, volle
   Kontrolle; bei Bedarf später austauschbar (Komponentengrenze TicketBoardList).
3. **Priorität 3 Stufen** (niedrig/mittel/hoch) + **Aufwand 4 Stufen** — mehr
   Stufen = Schein-Genauigkeit.
4. **Ein Label** (idea/issue/other) statt Label-Zoo — deckt die Feedback-
   Kategorien; mehr Kategorisierung leisten Priorität/Aufwand/Listen.
5. **status done ≠ Liste „Erledigt"** — der Haken ist Trello-Semantik
   (abgeschlossen markieren), die Liste ist Organisation; beides unabhängig.
6. **Kein md-File je Ticket** — Export on demand (Clipboard/Download).
7. **Realtime über Label-Read** (`label:admin`/`label:moderator` als
   Table-Permission) — Operator-Fenster synchronisieren live, Row-Security aus.

## 7. Phasen

- **P1 (dieses Paket):** Core-Capability, Layer komplett (Migration+Seed,
  Types/Zod, alle §4-Routen, Board+Modal+DnD, md-Export, Realtime, GDPR,
  i18n de/en), App-Komposition, Admin-Roadmap-Ablösung, Runner-Registrierung.
- **P2 — Feedback-Ingestion ✅ (2026-07-08):** Die APP verdrahtet (A14, Muster
  events/checkout): feedback rendert den „Als Ticket übernehmen"-Button, wenn
  `maui.feedback.ticketEndpoint` gesetzt ist UND der User `tickets.manage` hat;
  die App-Route `/api/app/feedback-ticket` liest die Feedback-Row und ruft
  `createTicketFromFeedback()` (tickets-Server-Util) — Ticket landet in der
  ERSTEN Board-Liste (Inbox-Semantik), Titel = erste Zeile, Beschreibung =
  Zitat + Meta, Kategorie → Label (bug→issue), `feedbackId` = Rückreferenz
  (Index tickets-002; Doppel-Übernahme → 409), Feedback wird als erledigt
  markiert. Kein Layer-zu-Layer-Import.
- **P3 — KI-Triage ✅ (2026-07-08, LIVE VERIFIZIERT 2026-07-09):** Server-Util
  `triageTicket()` gegen eine OpenAI-KOMPATIBLE Chat-Completions-API —
  Entscheidung: **OpenRouter** statt Vendor-SDK (David hat dort Guthaben;
  Model frei wählbar über `maui.tickets.ai.model`, Default
  `anthropic/claude-haiku-4.5`, `baseUrl` austauschbar). Key server-only
  `NUXT_TICKETS_AI_KEY`. Bewertet Relevanz (1–5 Sterne), schlägt Priorität/
  Aufwand vor, formuliert offene Rückfragen — schreibt den Abschnitt
  „🤖 KI-Triage" in die BESCHREIBUNG (ersetzt alte Triage per Marker) statt
  Felder still zu ändern. Läuft on demand (3-Punkte-Menü im Modal) und
  best-effort nach der Feedback-Übernahme (fire-and-forget, Realtime schiebt
  das Ergebnis nach). Ohne Key/Gate: sauberer 503 + erklärender Toast.
- **P4 — Komfort ✅ (2026-07-09):** Alles live verifiziert.
  - **Kommentare im Modal** (rechte Spalte, Trello-Muster): comments-Layer
    mit `targetType 'ticket'` — NEUER additiver Vertrag
    `maui.comments.operatorTargets`: solche Kommentare schreiben nur
    Operatoren (Gate dashboard.access) und die Rows tragen
    `read(label:admin/moderator)` statt `read(any)` (Admin-Client setzt die
    Label-Permissions) — Member sehen per Row-Security NICHTS (bewiesen:
    Admin 1 / Member 0 auf derselben targetId). Verdrahtung per
    Komponenten-Override `TicketModalComments` in der APP (A14).
  - **Beobachten**: Table `ticket_watchers` (Migration 003; eigene Table
    statt JSON — Zeilenbudget + userId-Query), Auge-Toggle im Modal,
    „Beobachtet"-Slideover auf dem Board (einsehen + entfolgen an einem Ort).
  - **Benachrichtigungen** via `notify()`-Vertrag (In-App-Bell; ein künftiges
    Messaging-Produkt dockt am selben Vertrag an): Zuweisung („Dir wurde …"),
    Listen-Move, Erledigt/Wieder geöffnet — Empfänger = Beobachter ∪
    Mitglieder minus Auslöser, best-effort im Hintergrund.
  - **Anhänge**: Table `ticket_files` + Bucket `ticket-files` (KEINE
    öffentlichen Permissions — Serving nur über die permission-geprüfte
    Download-Route); Magic-Bytes für Bilder/PDF, Text-Heuristik für
    md/txt/csv/json/log, max 10 MB (415 sonst); Kaskaden-Delete mit dem Ticket.
  - **Fälligkeits-Erinnerungen**: on-read-Sweep im Board-Load (Muster events)
    — offen + fällig binnen 24 h/überfällig + noch nicht erinnert →
    Notification, idempotent über `dueRemindedAt` (neue dueAt resettet).
  - Aktivitäts-Log: bewusst NICHT als eigenes Feature — Kommentare +
    Benachrichtigungen decken den Bedarf; echtes Log bei Bedarf später.

## 8. Abgelehnt / bewusst vertagt

- **Öffentliches Board / Member-Zugriff** — Operator-Werkzeug; öffentliche
  Roadmap wäre ein anderes Feature.
- **Karten-Cover-Bilder, Board-Hintergründe, Listen-Farben** — Trello-Deko,
  kein Arbeitswert für v1.
- **Mehrere Boards** — ein Board; das Datenmodell (Listen als Rows) trägt
  Mehrboard-Ausbau später ohne Schema-Bruch (boardId-Spalte additiv).
- **Automatisierungs-Regeln** (Butler) — P3-KI-Triage deckt den wichtigsten
  Fall; Rest bei echtem Bedarf.
