# M3 — Migrations-Audit „additiv-sicher" (Umsetzungsplan)

Stand: 2026-07-14 · Status: **in Umsetzung** (Go David)
Kontext: Strategie F4.8 — bevor IRGENDEIN automatischer Pfad (Wizard,
Provisioner, Feature-Toggle) Migrationen anstößt, muss jede Migration auf
einer BEFÜLLTEN Instanz gefahrlos laufen können. Bekannter Problemfall:
comments-002-Erstumbau (destruktiver Schema-Neuaufbau).

## Vorgehen

1. **Audit aller ~44 Migrationen** (3 parallele Audit-Slices): pro Datei
   klassifizieren —
   - `additiv-sicher`: legt nur an (Tables/Columns/Indexes/Rows), 409 → skip,
     keine Daten-/Schema-Zerstörung, auf befüllter Instanz gefahrlos
   - `destruktiv-mit-Guard`: zerstörerische Operation vorhanden, aber durch
     expliziten Zustands-Check geschützt (läuft nur, wenn Altzustand vorliegt)
   - `destruktiv`: kann auf befüllter Instanz Daten/Schema verlieren → FIX
2. **Fixes**: destruktive Pfade bekommen Guards (Ziel-Schema-Erkennung →
   skip) oder werden in Alt-Umbau (einmalig, dokumentiert) vs. Neuanlage
   getrennt.
3. **Dauerhaftigkeit statt Einmal-Audit**: `check:manifests` bekommt einen
   statischen Check — zerstörerische Appwrite-Aufrufe (deleteTable,
   deleteColumn, deleteRows, updateColumn…) in Migrationen sind nur mit
   Marker-Kommentar `// destruktiv-ok: <Begründung + Guard>` erlaubt.
   Neue Migrationen können den Audit-Status also nicht stillschweigend
   unterlaufen.
4. **Ergebnis-Tabelle** in diesem Dokument (Datei · Klassifikation · Fix).

## Abnahme

- Audit-Tabelle vollständig, alle Einträge additiv-sicher oder
  destruktiv-mit-Guard (+ Marker)
- Negativprobe: Migration mit ungeschütztem deleteTable → check rot
- `pnpm migrate --app reddit-comments` läuft komplett grün auf der
  befüllten lokalen Instanz (Re-Run-Beweis: idempotent + zerstörungsfrei)
- Bootstrap-Frische-Guard bleibt (Erst-Setup), dokumentierter Weg fürs
  NACH-Aktivieren: `pnpm migrate --app <app> --layer <layer>`

## Ergebnis — ✅ ABGESCHLOSSEN (2026-07-14)

3 parallele Audit-Läufe über alle 44 Migrationen (+ verify-schema):

| Slice | Dateien | Befund |
|---|---|---|
| system (18) · admin (3) · moderation (1) | 22 | **alle additiv-sicher** — nur create-Ops (409→skip), Default-Row via createRow statt Upsert, deklarativ-idempotente Table-Permissions |
| comments (10) · posts (3) | 13 | 12 additiv-sicher · **1 Fix: comments-002** (s. u.) |
| events (5) · feedback (1) · billing (1) · courses (1) · tickets (3) | 11 | **alle additiv-sicher** — 2 Nits behoben (s. u.) |

### Der eine echte Fix — comments-002

Der alte Guard („droppe beide Tables, wenn nicht BEIDE am Zielschema")
war nicht wasserdicht: Ein halbes Zielschema (Teil-Fehlschlag, fehlende
Einzelspalte) hätte die GESUNDE, befüllte Table mitgerissen. Neu:
**DROP nur bei positiv nachgewiesenem Alt-Schema** (Legacy-Spalte
`postId`/`text` vorhanden); `comment_votes` nur im Verbund (Rows
referenzieren die gedroppten comments — ihr Schema war nie anders).
Unvollständiges Zielschema wird jetzt additiv repariert (columnStep),
nie zerstört.

### Nits (behoben)

- `events/005-series.ts`: `existingColumnKeys` fängt jetzt 404 ab
  (Angleichung an alle Schwester-Migrationen).
- `tickets/002-feedback-index.ts`: Kommentar stellt klar, dass NUR die
  eigene Spalte `tickets.feedbackId` indiziert wird — kein
  Cross-Layer-Zugriff, läuft auch ohne installierten feedback-Layer.

### Dauerhaftigkeit

`pnpm check:manifests` prüft jetzt statisch: zerstörerische Aufrufe
(deleteTable/-Column/-Index/-Row(s), update*Column) in Migrationen sind
nur mit `// destruktiv-ok: <Begründung>`-Marker erlaubt. Negativprobe
demonstriert (comments-002 ohne Marker → rot).

### Abnahme-Beweis (befüllte lokale Instanz)

Voller Re-Run `pnpm migrate --app reddit-comments`: „Kein Alt-Schema
erkannt — DROP übersprungen", alle Migrationen grün, Datenbestand
identisch (150 Kommentare, 27 Members vorher = nachher).

**Konsequenz:** Nach-Aktivierung eines Features per
`pnpm migrate --app <app> --layer <layer>` ist auf befüllten Instanzen
freigegeben — die Voraussetzung für automatische Migrations-Trigger
(Provisioner, M6/M7) ist erfüllt.
