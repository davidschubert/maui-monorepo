# Plan: Vollständige GDPR-Löschung + Export via User-Data-Contributor-Vertrag

Stand: 2026-07-01 · Status: **Entwurf zur Umsetzung** · löst OPEN-ITEMS
„GDPR: Account-Löschung hinterlässt PII" + „Layer-Kopplung core→comments (A14-Verletzung)"

---

## 1. Ziel

1. **Vollständige Account-Löschung (Art. 17 DSGVO):** Selbst-Löschung
   (`DELETE /api/auth/account`) und Admin-Löschung
   (`DELETE /api/admin/users/[id]`) entfernen bzw. anonymisieren ALLE
   personenbezogenen Daten — Auth-User, Kommentare, Votes, Reports,
   Notifications, Presence, Avatar-Datei, Audit-Log-Namen/IPs.
2. **Pre-Delete-Snapshot:** Vor jeder Löschung wird ein vollständiger
   JSON-Export erzeugt und für Admins zeitlich befristet zum Download
   bereitgestellt (Storage-Bucket `gdpr-exports`). Der Self-Service-Export
   (`GET /api/auth/export`) und der Admin-Export
   (`GET /api/admin/users/[id]/export`) werden dabei vollständig
   (alle Datenarten, echte Pagination statt `Query.limit(1000)`).
3. **Expliziter Cross-Layer-Vertrag** (analog `notify()`): Feature-Layer
   registrieren `UserDataContributor`-Provider bei einer core-seitigen
   Registry. Core orchestriert Export und Löschung, ohne ein einziges
   Feature-Schema zu kennen → die A14-Verletzung in
   `core/server/utils/dataExport.ts` verschwindet.

**Nicht-Ziele:** kein Lösch-Scheduler/Grace-Period („Account wird in 30 Tagen
gelöscht"), keine E-Mail-Bestätigung der Löschung, kein DSGVO-Auskunfts-Workflow
über die JSON-Exporte hinaus. Alles bewusst später ergänzbar.

---

## 2. Ist-Analyse (verifiziert im Code, Stand heute)

### 2.1 Löschung entfernt nur den Auth-User

- `packages/core/server/api/auth/account.delete.ts` (Z. 16–18):
  `logAuthEvent('user.self_deleted', …)` (schreibt Name + IP ins Audit-Log!),
  dann `users.delete({ userId })`, dann `clearSessionCookie`. **Sonst nichts.**
- `packages/admin/server/api/admin/users/[id]/index.delete.ts` (Z. 25–28):
  `admin.users.delete({ userId })` + `recordAudit('user.deleted', …,
  targetName: name)`. **Sonst nichts.**

Was liegen bleibt (alles im Code verifiziert, siehe Inventar §3):
Kommentar-Rows mit `authorId`/`authorName` (öffentlich lesbar!), Vote-Rows,
Report-Rows, Notification-Rows, Presence (verfällt zwar nach 240 s TTL,
`heartbeat.post.ts` Z. 16), Avatar-Datei im Storage, Audit-Logs mit Klarname
+ IP.

Verschärfung: `comments/server/api/comments/index.get.ts` Z. 104–105 blankt
`content/authorName/authorId` bei `status === 'deleted'` **nur beim Lesen über
die Nuxt-Route**. Die Table ist `read(any)` (Migration
`comments/scripts/migrations/002-target-architecture.ts` Z. 137, für
Gäste-Realtime) — die **Row selbst** behält die PII und ist per Appwrite-REST/
Realtime roh lesbar. Anonymisierung muss also **in die Row geschrieben** werden,
Read-Time-Redaction reicht nicht.

### 2.2 Export ist unvollständig + verletzt A14

- `packages/core/server/api/auth/export.get.ts` (Z. 20–24) und
  `packages/admin/server/api/admin/users/[id]/export.get.ts` (Z. 26–30):
  beide lesen `tableId: 'comments'` mit `Query.limit(1000)` **ohne Pagination**
  (Kommentar 1001+ fehlt stillschweigend) und exportieren **nur** Account,
  Sessions, Kommentare — Votes, Reports, Notifications fehlen komplett.
- `packages/core/server/utils/dataExport.ts` (Z. 9, 36–45): der Fundament-Layer
  kennt das comments-Schema (`ExportCommentRow`, `mapExportComments`) —
  genau die A14-Verletzung (CONCEPT.md §A14: core „darf nie: Feature-Domäne").

### 2.3 Vorbild-Vertrag existiert bereits

`packages/core/server/utils/notify.ts`: typisierter Vertrag im Eigentümer-nahen
Layer, best-effort, kein String-Coupling beim Konsumenten. Der neue Vertrag
folgt demselben Muster, nur in umgekehrter Richtung (Feature → core-Registry
statt Feature → core-Funktion), weil hier **core der Aufrufer** ist und die
Feature-Layer die Daten besitzen.

### 2.4 Infrastruktur-Fakten, die der Plan nutzt

- Nitro scannt `server/utils` und `server/plugins` **aller Layer**
  (Auto-Import-Kommentar in `core/server/utils/appwrite.ts`). Es existieren
  noch **keine** `server/plugins/*` in irgendeinem Layer — die
  Contributor-Registrierung wird die ersten anlegen.
- `packages/system` hat heute **nur Migrations, keinen Server-Code** — die
  system-Tabellen (`notifications`, `audit_logs`) werden von core
  (`notify.ts`, `authAudit.ts`) und admin (`audit.ts`) beschrieben. Für den
  Vertrag bekommt system erstmals `server/plugins` + `server/utils`.
- Admin-Client bietet alle nötigen Services: `users`, `tablesDB`, `storage`,
  `presences` (`core/server/lib/appwrite.ts` Z. 58–63).
- Buckets gehören der App: `apps/reddit-comments/scripts/bootstrap.ts` legt den
  `avatars`-Bucket an (Z. 58–70); die Storage-Routen in core allowlisten NUR
  den Avatars-Bucket (`storage/[bucket]/[fileId].delete.ts` Z. 14–16).

---

## 3. Datenmodell-Inventar — wo liegt PII des Users? (im Code verifiziert)

| # | Ort | PII | Beleg | Eigentümer-Layer | Maßnahme bei Löschung |
|---|-----|-----|-------|------------------|------------------------|
| 1 | Appwrite Auth-User | name, email, phone, prefs (`bio`, `avatarUrl`), Sessions (IP, Client, Land) | `dataExport.ts` Z. 11–33 | core (Lifecycle) | `users.delete()` — **als letzter Schritt** |
| 2 | Table `comments` | `authorId`, `authorName` (öffentlich, `read(any)`), `content` (kann Freitext-PII enthalten) | `shared/types/comment.ts` Z. 24–25; Migration 002 Z. 137 | comments | Row-Anonymisierung (Tombstone, §4.4) |
| 3 | Table `comment_votes` | `userId` + Vote-Wert (Meinungsdaten) | `verify-schema.ts` (`commentId`,`userId`,`value`); Migration 002 Z. 193 `read(users)` | comments | Hard-Delete der Rows; denormalisierte Zähler (`upvotes/downvotes/score`) bleiben — Aggregate ohne Personenbezug |
| 4 | Table `reports` | `reporterId` (Melder), `resolvedBy` (Moderator) | `moderation/scripts/migrations/001-reports.ts`; `reports/index.post.ts` Z. 36 | moderation | Hard-Delete als Melder; `resolvedBy` pseudonymisieren |
| 5 | Table `notifications` | `recipientId`; **Verursacher-PII im Payload**: `title` = Klarname des Antwortenden, `body` = Kommentar-Snippet (`comments/index.post.ts` Z. 74) — es gibt **keine `senderId`-Spalte** (Migration system-003) | system-003; `notify.ts` | system (Schema) / core (Schreib-Code) | Als Empfänger: Hard-Delete. Als Verursacher: `senderId`-Spalte nachrüsten + löschen/anonymisieren (§4.6) |
| 6 | Table `audit_logs` | `actorId`, `actorName`, `targetName`, `ip` (Migration system-004), `metadata` (z. B. `{ name }` bei self_delete) | system-001/004; `authAudit.ts` Z. 28–37; `admin/server/utils/audit.ts` Z. 29–38 | system | Pseudonymisierung: Namen + IP leeren, `actorId`/Struktur behalten (§4.7) |
| 7 | Presences API | `presenceId = userId`, metadata `userName`, `avatarUrl`, Aktivität | `presence/heartbeat.post.ts` Z. 26–28, 39–55 | core (Code) | `presences.delete({ presenceId: userId })` — wie `presence/leave.post.ts` Z. 11 (TTL 240 s wäre auch ohne dies das Sicherheitsnetz) |
| 8 | Storage `avatars`-Bucket | Foto des Users; fileId steckt in `prefs.avatarUrl` | `profile.put.ts` Z. 5–9 (URL→fileId-Parser), Bucket: `bootstrap.ts` Z. 58–70 | App (Bucket) / core (Code) | `storage.deleteFile()` **vor** `users.delete()` (danach sind die prefs weg) |
| 9 | (neu) Storage `gdpr-exports` | der Snapshot selbst ist PII | — | App (Bucket) / core (Code) | Aufbewahrungsfrist + Auto-Cleanup (§4.8) |

Nicht betroffen: `app_config`, `changelog` (kein Personenbezug pro User),
Rate-Limit-Buckets (in-memory, IP-basiert, flüchtig).

---

## 4. Soll-Architektur

### 4.1 Der Vertrag: `UserDataContributor` (core-Registry)

Neue Datei `packages/core/server/utils/userData.ts` (Auto-Import via Nitro):

```ts
import type { H3Event } from 'h3'

export interface UserDataDeleteResult {
  /** hart gelöschte Rows/Dateien */
  deleted: number
  /** in-place anonymisierte/pseudonymisierte Rows */
  anonymized: number
}

export interface UserDataContributor {
  /** stabil + eindeutig, z. B. 'comments', 'moderation', 'system' */
  id: string
  /**
   * Alle Daten des Users als export-fertiges, JSON-serialisierbares Objekt.
   * MUSS intern vollständig paginieren (listAllRows, §4.2). Wirft bei Fehlern
   * (der Orchestrator entscheidet über Teilfehler-Reporting).
   */
  exportUserData(event: H3Event, userId: string): Promise<unknown>
  /**
   * Löscht/anonymisiert alle Daten des Users im eigenen Layer.
   * MUSS idempotent sein: Re-Run nach Teilfehler findet Rest-Daten
   * (oder nichts) und terminiert erfolgreich.
   */
  deleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult>
}

const contributors = new Map<string, UserDataContributor>()

export function registerUserDataContributor(c: UserDataContributor): void {
  contributors.set(c.id, c) // idempotent bei HMR-Doppel-Registrierung
}

export function listUserDataContributors(): UserDataContributor[] {
  // deterministische Reihenfolge unabhängig von Plugin-Ladereihenfolge
  return [...contributors.values()].sort((a, b) => a.id.localeCompare(b.id))
}
```

**Registrierung** je Layer als Nitro-Plugin (`server/plugins/user-data.ts` in
`packages/comments`, `packages/moderation`, `packages/system`) — läuft einmal
beim Serverstart, kein Request-State. Der Vertrag ist explizit und typisiert
(Feature importiert das Interface sichtbar über den Auto-Import des
Fundament-Layers — erlaubte Richtung Feature→core, A14-konform). Apps ohne
einen Layer haben dessen Plugin schlicht nicht → Registry ist automatisch
korrekt komponiert (dasselbe Kompositionsprinzip wie `maui.admin.modules`).

### 4.2 Pagination-Helfer (core)

`packages/core/server/utils/listAllRows.ts`: Cursor-Pagination
(`Query.cursorAfter(last.$id)` + `Query.limit(100)`) mit Sicherheits-Cap
(z. B. 50 000 Rows → danach Fehler statt Endlosschleife). Ersetzt jedes
`Query.limit(1000)` in Export/Löschung; Contributors nutzen ihn verpflichtend.

### 4.3 Orchestrierung (core)

Zwei Orchestrator-Funktionen in `packages/core/server/utils/userData.ts`
(bzw. Nachbar-Datei `userDataOrchestration.ts`):

```
exportUserCompletely(event, userId, { via: 'session' | 'admin' })
  → { exportedAt, account, sessions, data: { [contributorId]: unknown } }

deleteUserCompletely(event, userId, { actor: 'self' | 'admin', snapshot: boolean })
  → { ok, exportFileId?, results: { id, ok, deleted, anonymized, error? }[] }
```

**Ablauf `deleteUserCompletely` (Text-Diagramm):**

```
DELETE /api/auth/account (self)          DELETE /api/admin/users/[id] (admin)
        │ (requireUser)                        │ (requirePermission users.manage,
        │                                      │  assertNotLastAdmin, nicht-selbst)
        └──────────────┬───────────────────────┘
                       ▼
        core: deleteUserCompletely(event, userId, opts)
        ────────────────────────────────────────────────
        (0) users.get(userId) → 404? → „Orphan-Cleanup-Modus":
            Schritte 1–3 überspringen, direkt 4–6 (Re-Run nach Teilfehler,
            bei dem der Auth-User schon weg wäre — heute unmöglich, weil
            users.delete letzter Schritt ist, aber defensiv)
        (1) SNAPSHOT: exportUserCompletely() → JSON → Storage-Bucket
            'gdpr-exports' (fileId ID.unique(), Permissions read(label:admin))
            → Fehler hier = ABBRUCH (ohne Snapshot keine Löschung, §6 E3)
        (2) SPERREN: users.updateStatus(blocked) + users.deleteSessions()
            → User kann während des Cleanups keine neuen Daten erzeugen;
            ein Teilfehler hinterlässt einen gesperrten (nicht halb
            gelöschten, aber handlungsunfähigen) Account
        (3) AUDIT: recordAudit/logAuthEvent 'user.deleted'/'user.self_deleted'
            — targetName/metadata OHNE Klarnamen (nur userId + exportFileId);
            der Klarname steht im Snapshot, nicht im dauerhaften Log
        (4) CONTRIBUTORS (sequenziell, sortiert nach id):
            for c of listUserDataContributors():
              try { results.push(await c.deleteUserData(event, userId)) }
              catch (e) { results.push({ id, ok:false, error }) }   // weiterlaufen
        (5) CORE-EIGENE CLEANUPS (best effort, einzeln gefangen):
            – Avatar: fileId aus prefs.avatarUrl parsen (Logik aus
              profile.put.ts extrahieren) → storage.deleteFile(avatarsBucket)
            – Presence: presences.delete({ presenceId: userId })
        (6) FINALISIEREN:
            – alle results ok?  → users.delete(userId)  → 200 + Report
            – ein Teilfehler?   → users.delete NICHT ausführen → 500/207 +
              Report; User bleibt gesperrt; Admin wiederholt die Löschung
              (alle Schritte idempotent, Re-Run räumt den Rest ab)
        (self-Pfad zusätzlich: clearSessionCookie IMMER — auch bei Teilfehler,
         die Session ist durch Schritt 2 ohnehin tot)
```

**Entscheidung „best effort vs. transactional":** Appwrite-Transactions
über Tables + Storage + Users-API existieren nicht — echte Atomarität ist
unerreichbar. Gewählt: **„best effort mit hartem Abschlusskriterium"**:
jeder Contributor läuft isoliert weiter (ein kaputter Layer blockiert nicht
das Aufräumen der anderen), aber `users.delete()` passiert **nur bei
Voll-Erfolg**. Damit ist der sichtbare Endzustand binär: entweder „alles weg"
oder „User gesperrt + actionabler Fehler-Report + gefahrloser Re-Run".
Das unterscheidet sich bewusst vom `notify()`-Schlucken: eine halb
fehlgeschlagene GDPR-Löschung darf nicht als Erfolg enden.

**Idempotenz konkret:** Alle Schritte sind Wiederholungs-fest —
Queries auf bereits bereinigte Daten liefern leere Seiten (`deleted: 0`),
`updateStatus(blocked)` auf Geblocktem ist no-op, `presences.delete`/
`storage.deleteFile` behandeln 404 als Erfolg, der Snapshot wird beim Re-Run
neu erzeugt (zweite Datei — harmlos, Cleanup räumt sie mit ab; alternativ
deterministische fileId `gdpr-<userId>`, §6 E4).

### 4.4 Comments-Contributor (`packages/comments/server/plugins/user-data.ts` + `server/utils/userDataContributor.ts`)

- **export:** alle `comments` mit `authorId == userId` (paginiert) →
  bestehende Map-Form aus `mapExportComments` hierher umziehen; **plus** alle
  `comment_votes` mit `userId == userId` (`commentId`, `value`, `$createdAt`).
- **delete — Entscheidung: Anonymisieren statt Hard-Delete (Tombstone):**
  - Hard-Delete zerreißt Threads: `parentId`/`rootId` fremder Antworten
    zeigen ins Leere, `depth`-Ketten und die Count-Logik des Stores driften
    (genau die Phantom-Reply-Klasse, die laut OPEN-ITEMS schon einmal gefixt
    wurde). Antworten ANDERER User sind deren Daten — die darf die Löschung
    eines Autors nicht mitreißen.
  - Deshalb pro Kommentar-Row (paginiert, `updateRow`):
    `authorId: ''`, `authorName: ''`, `content: ''`, `status: 'deleted'`,
    `editedAt: null`. Das ist **Erasure in der Row** (auch REST/Realtime-roh
    keine PII mehr, vgl. §2.1) — die UI zeigt automatisch den vorhandenen
    „[gelöscht]"-Platzhalter (Read-Redaction Z. 104–105 greift weiter,
    wird aber nicht mehr gebraucht). Kein i18n-String in der DB: der
    Platzhalter „Gelöschter Nutzer" ist Sache der UI-Schicht (bereits so
    implementiert), gespeichert wird das leere Sentinel.
  - `content` wird mit geleert (nicht Reddit-Style stehen gelassen), weil
    Freitext regelmäßig Selbst-PII enthält („Ich, Max, …") — Art.-17-sicher
    ist nur der Tombstone. Wer Reddit-Verhalten will: §6 E1.
  - **Votes:** Hard-Delete aller `comment_votes`-Rows des Users. Die
    denormalisierten Zähler (`upvotes/downvotes/score`) bleiben unverändert —
    Aggregate ohne Personenbezug; ein Re-Count wäre zudem ein verzerrender
    Eingriff in fremde Inhalte. (Konsequenz dokumentieren: Summe der
    Vote-Rows ≠ Zähler nach Löschungen — der bestehende „selbstheilend beim
    nächsten Vote"-Mechanismus gleicht pro Kommentar beim nächsten Vote an.
    Falls das nicht gewollt ist: §6 E2.)

### 4.5 Moderation-Contributor (`packages/moderation/server/plugins/user-data.ts` + Util)

- **export:** alle `reports` mit `reporterId == userId`
  (targetType/targetId/reason/note/status/$createdAt).
- **delete:**
  - Rows mit `reporterId == userId`: **Hard-Delete** (offene wie erledigte) —
    eine Meldung ist Meinungs-/Verhaltensdatum des Melders; der
    Moderations-*Effekt* (hidden-Status des Ziels, Audit-Eintrag der
    Moderationsaktion) bleibt unabhängig von der Report-Row bestehen.
    Offene Meldungen zu weiterhin problematischen Inhalten können andere
    User erneut abgeben.
  - Rows mit `resolvedBy == userId` (der Gelöschte war Moderator):
    `resolvedBy: ''` pseudonymisieren (Lifecycle-Status bleibt).
  - Benötigt zwei paginierte Queries; für `resolvedBy` fehlt ein Index —
    neuer Key-Index per Migration `moderation/002` (oder bewusst Full-Scan
    über `listAllRows`, Reports-Volumen ist klein — Entscheidung im Schritt).

### 4.6 System-Contributor (`packages/system/server/plugins/user-data.ts` + Util) — erster Server-Code im system-Layer

- **notifications:**
  - **export:** alle Rows mit `recipientId == userId` (Index `recipient`
    existiert, system-003).
  - **delete als Empfänger:** Hard-Delete aller Rows `recipientId == userId`.
  - **delete als Verursacher:** heute nicht abfragbar — `title` trägt den
    Klarnamen des Antwortenden (`comments/index.post.ts` Z. 74:
    `title: user.name`), aber es gibt keine `senderId`-Spalte. Fix:
    Migration `system-008` fügt `senderId` (varchar 255, optional) + Index
    hinzu; `NotifyInput`/`notify()` bekommt optionales `senderId`; die
    Aufrufstelle in comments übergibt `user.$id`. Der Contributor löscht dann
    Rows mit `senderId == userId` hart (einfacher und sauberer als Title-
    Rewriting — es sind flüchtige Benachrichtigungen, kein Verlust).
    **Bestandsdaten** ohne senderId: einmaliger Backfill unmöglich (kein
    verlässlicher Schlüssel) → akzeptierte Lücke, dokumentieren; Alt-Rows
    sterben mit dem Empfänger-Delete bzw. sind nur für den Empfänger lesbar.
- **audit_logs — Entscheidung: Pseudonymisierung statt Löschung:**
  - Abwägung: Audit-Integrität (Nachvollziehbarkeit privilegierter Aktionen,
    Missbrauchs-/Rechtsverteidigung — berechtigtes Interesse Art. 6 (1) f,
    Ausnahme Art. 17 (3) e) vs. Erasure. Branchenüblich und hier gewählt:
    **Struktur behalten, Identifikatoren pseudonymisieren.** Die `actorId`
    (Appwrite-userId) bleibt — nach `users.delete()` ist sie keinem
    Menschen mehr zuordenbar (kein Klarname im System), erhält aber die
    Ereignis-Verkettung.
  - Konkret, paginiert über Index `actor` (`actorId == userId`):
    `actorName: ''`, `ip: ''`, `metadata`: Feld `name` entfernen (betrifft
    `user.self_deleted` aus `authAudit.ts` Z. 16). Zusätzlich Query über
    `targetId == userId`: `targetName: ''` (betrifft u. a. `user.deleted`,
    `user.exported` aus admin). Für `targetId` fehlt ein Index → Migration
    `system-008` ergänzt ihn mit.
  - Die Admin-Audit-UI (`admin/server/api/admin/audit.get.ts` +
    `resolveAvatars`) zeigt danach userId ohne Name/Avatar — akzeptiert.

### 4.7 Core-eigene Anteile (kein Contributor nötig)

Account/Sessions (`users.delete` löscht Sessions mit), Avatar-Datei,
Presence — orchestriert direkt in `deleteUserCompletely` (§4.3 Schritt 5),
denn Auth-Lifecycle, Storage-Routen und Presence-Code liegen in core.
Der URL→fileId-Parser aus `profile.put.ts` Z. 5–9 wird nach
`core/server/utils/avatarFile.ts` extrahiert (eine Quelle, zwei Nutzer).

### 4.8 Pre-Delete-Snapshot: Bucket `gdpr-exports`

- **Anlage:** `bootstrap.ts` legt (idempotent, wie `avatars`) einen Bucket
  `gdpr-exports` an: `fileSecurity: true`, **keine** Bucket-weiten
  create/read-Permissions (nur Server-API-Key schreibt), `encryption: true`
  (PII at rest), maximumFileSize großzügig (JSON), Extension `json`.
  Env: `NUXT_PUBLIC_APPWRITE_GDPR_BUCKET` (Konvention wie AVATARS_BUCKET;
  public ist okay — es ist nur eine ID, die Zugriffe laufen über Admin-Routen
  mit `requirePermission`).
- **Datei:** `gdpr-export-<userId>-<ISO-Timestamp>.json` via
  `storage.createFile` + `InputFile.fromBuffer`, File-Permissions
  `read(Role.label('admin'))` — Download läuft trotzdem über eine
  Server-Route (SSR-Architektur: der Browser hat keine SDK-Session);
  die Label-Permission ist Zweitverteidigung/Realtime-Option, die
  eigentliche Autorität ist `requirePermission(event, 'users.manage')`.
- **Zugriff (admin-Layer, neue Routen):**
  - `GET /api/admin/gdpr-exports` — Dateien listen (storage.listFiles,
    paginiert) + Audit `gdpr_export.listed` optional
  - `GET /api/admin/gdpr-exports/[fileId]` — Download
    (`storage.getFileDownload`, Content-Disposition attachment) + Audit
  - `DELETE /api/admin/gdpr-exports/[fileId]` — manuelles Aufräumen + Audit
  - Die core-Storage-Routen (`storage/[bucket]/*`) bleiben avatars-only —
    KEINE Aufweichung der Allowlist; GDPR-Exports sind ein Admin-Feature.
- **Aufbewahrungsfrist: 30 Tage, dann Auto-Cleanup.** Begründung:
  Der Snapshot dient (a) der Rechenschaftspflicht (Art. 5 (2) — beweisen
  können, WAS gelöscht wurde), (b) Missbrauchs-/Support-Fällen kurz nach
  der Löschung („das war ein Versehen", Streit über Inhalte). Beides ist
  nach Wochen erledigt; unbegrenzte Aufbewahrung wäre selbst ein Verstoß
  gegen die Speicherbegrenzung (Art. 5 (1) e) und würde die Löschung ad
  absurdum führen.
  **Mechanik ohne neue Infrastruktur (kein Cron im Stack):** Lazy Cleanup —
  die List-Route (und der Snapshot-Schritt selbst) löschen beim Aufruf
  best-effort alle Dateien `> 30 Tage` (`$createdAt`-Vergleich). Damit
  garantiert jeder Admin-Kontakt mit dem Feature die Frist; eine
  Appwrite-Scheduled-Function als härtere Garantie ist §6 E5.

### 4.9 Exporte auf den Vertrag umstellen

- `core/server/api/auth/export.get.ts` → ruft `exportUserCompletely(event,
  user.$id)`; das comments-Wissen (Z. 20–24) entfällt ersatzlos.
- `admin/server/api/admin/users/[id]/export.get.ts` → dito + bestehendes
  `recordAudit('user.exported')` bleibt.
- `core/server/utils/dataExport.ts`: `mapExportComments` + `ExportCommentRow`
  **entfernen** (zieht in den comments-Contributor um); `mapExportAccount`/
  `mapExportSessions` bleiben (Account/Sessions sind Core-Domäne).
- Sessions im Self-Export weiterhin über den Session-Client
  (`account.listSessions`), im Admin-Pfad über `users.listSessions` —
  der Orchestrator bekommt dafür den `via`-Switch (§4.3).

### 4.10 A14-Konformität des Ergebnisses

- core kennt danach kein Feature-Schema mehr (nur noch die dokumentierte,
  bewusste core→system-Ausnahme in `notify.ts`/`authAudit.ts` — unverändert).
- Feature→core-Import des Interfaces ist die erlaubte Richtung; ESLint-
  Backstop unverändert gültig. CONCEPT §A14 um den neuen Vertrag ergänzen
  (Zeile in der „Durchsetzung"-Liste: `registerUserDataContributor` als
  Beispiel expliziter Verträge neben `notify()` und `maui.admin.modules`).

---

## 5. Umsetzungsschritte (nummerierte Todo-Liste)

Reihenfolge = Abhängigkeitsreihenfolge; nach jedem Schritt lint/typecheck grün
(Node 22!), Commits getrennt nach Layer (Core-Änderungen eigener Commit).

1. **Core: Vertrag + Registry + Pagination** — `packages/core/server/utils/userData.ts`
   (Interface, `registerUserDataContributor`, `listUserDataContributors`),
   `packages/core/server/utils/listAllRows.ts` (Cursor-Pagination + Cap,
   Unit-Tests für die reine Schleifenlogik). **(M)**
2. **Core: Avatar-Util extrahieren** — `avatarFileId()` aus
   `core/server/api/auth/profile.put.ts` Z. 5–9 nach
   `core/server/utils/avatarFile.ts`; profile.put.ts nutzt den Util. **(S)**
3. **Comments-Contributor** — `packages/comments/server/utils/userDataContributor.ts`
   (export: comments+votes paginiert; delete: Tombstone-Anonymisierung +
   Vote-Hard-Delete, §4.4) + `packages/comments/server/plugins/user-data.ts`
   (Registrierung). `mapExportComments`-Logik zieht hierher. Index-Check:
   `authorId` (Migration 003 vorhanden) + `comment_votes`-Query über
   `userId` (Index nötig? → Mini-Migration `comments/007-votes-user-index.ts`,
   idempotent). **(M)**
4. **Moderation-Contributor** — `packages/moderation/server/utils/userDataContributor.ts`
   + `server/plugins/user-data.ts` (export: reports als Melder; delete:
   Hard-Delete Melder-Rows, `resolvedBy`-Pseudonymisierung, §4.5); optional
   Migration `moderation/002-resolvedby-index.ts`. **(S)**
5. **System: Migration 008** — `packages/system/scripts/migrations/008-gdpr-columns.ts`:
   `notifications.senderId` (varchar 255, optional) + Index `sender`;
   `audit_logs`-Index `target` auf `targetId`. Idempotent (409→skip,
   Columns auf `available` pollen). **(S)**
6. **Core: `notify()` um `senderId` erweitern** — `NotifyInput.senderId?`,
   Schreiben der Spalte; Aufrufstelle
   `comments/server/api/comments/index.post.ts` Z. 74 übergibt `user.$id`.
   **(S)**
7. **System-Contributor (erster Server-Code im Layer)** —
   `packages/system/server/utils/userDataContributor.ts` +
   `server/plugins/user-data.ts` (export: notifications als Empfänger;
   delete: Empfänger-Hard-Delete, Sender-Hard-Delete via `senderId`,
   audit_logs-Pseudonymisierung actor+target, §4.6). Prüfen, dass Nitro die
   neuen Verzeichnisse des Layers scannt (system ist via extends überall
   drin). **(M)**
8. **Core: Orchestratoren** — `exportUserCompletely` +
   `deleteUserCompletely` (§4.3; Sperren, Snapshot-Hook als Parameter,
   sequenzielle Contributor-Läufe, Fehler-Report-Typ, Orphan-Modus,
   users.delete zuletzt). Unit-Tests mit Fake-Contributors (Erfolg,
   Teilfehler → kein users.delete, Re-Run). **(L)**
9. **Exporte umstellen** — `core/server/api/auth/export.get.ts` und
   `admin/server/api/admin/users/[id]/export.get.ts` auf
   `exportUserCompletely`; `dataExport.ts` von comments-Wissen befreien
   (§4.9). **(M)**
10. **Bucket + Snapshot** — `apps/reddit-comments/scripts/bootstrap.ts`:
    `gdpr-exports`-Bucket (idempotent, §4.8); `.env(.example)`:
    `NUXT_PUBLIC_APPWRITE_GDPR_BUCKET`; Snapshot-Schritt in
    `deleteUserCompletely` (createFile + read(label:admin)). **(M)**
11. **Lösch-Routen umstellen** —
    `core/server/api/auth/account.delete.ts` und
    `admin/server/api/admin/users/[id]/index.delete.ts` rufen
    `deleteUserCompletely`; Audit-Aufrufe ohne Klarnamen (§4.3 Schritt 3);
    Fehler-Report als Response (admin) bzw. generisch + Log (self —
    keine Interna an den Ex-User leaken); `clearSessionCookie` immer. **(M)**
12. **Admin-Routen für Exporte** — `packages/admin/server/api/admin/gdpr-exports/`
    `index.get.ts` (List + Lazy-Cleanup > 30 d), `[fileId].get.ts`
    (Download + Audit), `[fileId].delete.ts` (+ Audit); alle
    `requirePermission('users.manage')`, `toH3Error`-Mapping. **(M)**
13. **Admin-UI (minimal)** — `users/[id].vue`: Lösch-Dialog erwähnt
    Snapshot + verlinkt Download nach Erfolg; optional eigene Karte
    „GDPR-Exporte" (Liste + Download + Löschen) unter
    `dashboard/admin`. i18n-Keys de+en, Zod wo Formulare. **(M)**
14. **Docs + Aufräumen** — CONCEPT §A14 (Vertrag ergänzen), OPEN-ITEMS
    (beide Punkte abhaken), CLAUDE.md-Kurznotiz (Vertrag existiert),
    README-Status gemäß Memory-Regel. **(S)**
15. **Verifikation** — Testplan §7 komplett durchziehen (inkl.
    least-privileged RBAC-Test gemäß Memory-Regel), alle Apps lokal starten
    (Core-Update-Regel). **(M)**

Geschätzter Gesamtumfang: ~2–3 fokussierte Arbeitstage.

---

## 6. Offene Entscheidungen für den Maintainer

| # | Frage | Default im Plan | Alternative |
|---|-------|-----------------|-------------|
| E1 | Kommentar-`content` bei Erasure leeren? | Ja (Tombstone, Art.-17-sicher) | Reddit-Style: Inhalt behalten, nur Autor anonymisieren — dann Config-Gate `maui.gdpr.keepContentOnErasure` (Default false) |
| E2 | Vote-Zähler nach Vote-Row-Löschung neu berechnen? | Nein (Aggregate bleiben; Selbstheilung beim nächsten Vote) | Re-Count pro betroffenem Kommentar im Contributor (teuer: ein Query pro Kommentar) |
| E3 | Snapshot-Pflicht auch bei **Selbst**-Löschung? | Ja (Missbrauchs-/Support-Fälle; 30-Tage-Frist begrenzt das Risiko) | Datenschutzfreundlicher: nur bei Admin-Löschung snapshotten bzw. Gate `maui.gdpr.snapshotOnSelfDelete` |
| E4 | Snapshot-fileId deterministisch (`gdpr-<userId>`) statt `ID.unique()`? | `ID.unique()` + Timestamp im Namen (Re-Runs erzeugen Zweitdatei, Cleanup räumt) | deterministisch = idempotenter, aber Re-Run überschreibt den Erst-Snapshot (delete+create nötig) |
| E5 | Cleanup-Garantie über Lazy-Cleanup hinaus? | Lazy in der List-Route + beim Snapshot | Appwrite Scheduled Function (Function-Scaffold existiert laut OPEN-ITEMS-Ideen) — täglicher Sweep |
| E6 | `resolvedBy`-Query per Index oder Full-Scan? | Full-Scan via listAllRows (Reports-Volumen klein) | Migration `moderation/002-resolvedby-index.ts` |
| E7 | Fehler-Report bei Self-Delete-Teilfehler an den (Ex-)User? | Nein — generischer 500 + Server-Log; Details nur im Admin-Pfad | 207-artige Response auch für self |
| E8 | Alt-Notifications ohne `senderId` (Verursacher-Name im `title`) | akzeptierte, dokumentierte Lücke (nur Empfänger-lesbar, stirbt mit Empfänger-Delete) | Einmal-Skript: alle notifications hart löschen (flüchtige Daten) → sauberer Schnitt |

---

## 7. Testplan

**Unit (Vitest, reine Logik):**
1. Registry: Registrierung idempotent, `listUserDataContributors` sortiert
   deterministisch.
2. Orchestrator mit Fake-Contributors: (a) alle ok → `users.delete` genau
   1× (Mock), Report vollständig; (b) einer wirft → andere laufen trotzdem,
   `users.delete` NICHT gerufen, Report markiert den Fehler; (c) Re-Run nach
   (b) mit nun leerem Datenbestand → ok, `deleted: 0`.
3. `listAllRows`: 0/1/2,5 Seiten, Cursor-Weitergabe, Cap-Abbruch.
4. Tombstone-Mapper der comments-Anonymisierung (Row → Update-Payload).

**Integration/E2E (lokale Appwrite-Instanz, `bootstrap --seed` als Basis):**
5. **Voll-Löschung self:** User anlegen mit Avatar-Upload, 3 Kommentaren
   (davon 1 Reply eines ZWEITEN Users darunter), 2 Votes, 1 Report,
   1 empfangenen + 1 verursachten Notification, aktiver Presence →
   `DELETE /api/auth/account` → verifizieren (Admin-Client, roh):
   Auth-User 404; Kommentar-Rows: `authorId/authorName/content == ''`,
   `status == 'deleted'`; Reply des zweiten Users unverändert erreichbar
   (Thread intakt); `comment_votes` des Users leer; `reports` des Users leer;
   `notifications` (Empfänger + `senderId`) leer; `presences.get(userId)` 404;
   Avatar-File 404; `audit_logs` mit `actorId == userId`: `actorName == ''`,
   `ip == ''`; Snapshot-Datei existiert im `gdpr-exports`-Bucket.
6. **Roh-Lese-Check (der eigentliche Leak):** anonymisierte Kommentar-Row als
   Gast per Appwrite-REST lesen (Table ist read(any)) → keine PII in der Row.
7. **Voll-Löschung admin:** wie (5) über `DELETE /api/admin/users/[id]`;
   zusätzlich: Audit `user.deleted` existiert mit leerem `targetName` und
   `exportFileId` in metadata; Snapshot per
   `GET /api/admin/gdpr-exports/[fileId]` herunterladbar, Inhalt enthält
   alle Datenarten (account, sessions, data.comments, data.moderation,
   data.system) inkl. Votes/Reports.
8. **Teilfehler-Pfad:** einen Contributor künstlich werfen lassen (z. B.
   Tabelle temporär umbenennen) → Response meldet Fehler, Auth-User existiert
   noch, ist aber `blocked` (Login schlägt fehl); Tabelle zurück, Löschung
   wiederholen → Voll-Erfolg.
9. **Pagination:** User mit > 100 Kommentaren seeden (Script) → Export enthält
   alle; Löschung anonymisiert alle (Count-Verifikation per Query).
10. **Export-Parität:** `GET /api/auth/export` (Session) und Admin-Export
    desselben Users liefern dieselben Datenarten; Kommentar 101+ enthalten.
11. **RBAC least-privileged** (Memory-Regel): User OHNE Labels →
    `GET/DELETE /api/admin/gdpr-exports*` → 403; Download der Snapshot-Datei
    über die core-Storage-Route (`/api/storage/gdpr-exports/...`) → 403
    (Bucket-Allowlist greift).
12. **Retention:** Export-Datei mit altem `$createdAt` faken (oder Frist auf
    Sekunden konfigurierbar machen) → List-Aufruf entfernt sie.
13. **Apps ohne Layer:** core/.playground (ohne comments/moderation/admin)
    starten → Registry leer bzw. teilbesetzt, Self-Delete + Self-Export
    funktionieren ohne 500 (Kompositionstest).
14. **Regression:** bestehende comments/admin/core-Testsuiten + `nuxi
    typecheck` in reddit-comments; Realtime-E2E (`e2e/realtime.spec.ts`)
    unverändert grün.
