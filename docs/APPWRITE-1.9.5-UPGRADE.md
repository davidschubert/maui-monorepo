# Appwrite 1.9.0 → 1.9.5 — Upgrade- & Feature-Plan

Stand: 2026-06-30. Self-hosted Appwrite von **1.9.0 → 1.9.5**. Ziel: Phase 18
(Realtime-Rückbau aufs SDK + `usePresence`) entsperren und die neuen self-hosted
Features nutzen. Quellen: GitHub-Release 1.9.5, Appwrite Realtime-/Auth-/Storage-Docs
(autoritativ geprüft), siehe auch [OPEN-ITEMS.md](OPEN-ITEMS.md) Phase 18.

## TL;DR — Verdikt

**Phase 18 ist nach dem Server-Upgrade komplett startklar (nicht nur Presences).**
Das 1.9.5-Release bringt self-hosted: Realtime-**Query-Subscriptions** (server-seitig
gefiltert), TablesDB-Channels, **Presences API**, parallele Chunk-Uploads, Email-Policies.
Das Web-SDK `appwrite@26.1.0` (bereits installiert) kann das alles schon
(`Realtime` + `Channel.tablesdb().table().row()` + `queries`-Param + `upsertPresence()`).
→ **Kein SDK-Bump nötig; der einzige Blocker ist der Server.**

## Was 1.9.5 für uns bringt (geprüft an Release-Notes + Docs)

| Feature | Status in 1.9.5 | Projekt-Relevanz |
|---|---|---|
| **Realtime Query-Subscriptions** | „query subscription fixes, atomic payload handling, action channels" | **Hoch** — `useRealtimeRows` kann vom Native-WebSocket (Legacy-Protokoll, Client-`where`) auf SDK + server-seitige `Query`-Filter umgebaut werden |
| **Presences API** | self-hostbar (mehrere PRs) | **Hoch** — `usePresence`/Thread-Presence via `upsertPresence()` + `Channel.presences()` statt presence-Table mit manuellem Stale-Cleanup |
| **Parallele Chunk-Uploads** | „out-of-order and parallel chunk uploads, S3 multipart ETag" | **Niedrig** — automatisch (SDK v26 vorhanden), aber nur für CHUNKED Uploads (>5 MB). Avatare sind klein/Single-Request → kein Effekt |
| **Email-Policies** | „disposable email blocking and corporate email policies" | **Mittel** — Console-Toggle (Auth-Security), kein Code; optional freundlichere i18n-Fehlermeldung beim Signup |
| Sonstiges | X-OAuth, Rust-Runtime, BigInt-Columns, Git-Deploy-Trigger, bessere Migrationen | aktuell nicht akut |

**Breaking Changes:** keine explizit in den 1.9.5-Release-Notes gelistet.

## Risiken / vorher prüfen

1. **Compose-Diff** — Release-Notes warnen self-hosted-User ausdrücklich, die
   generierten `docker-compose.yml`-Änderungen vor dem Upgrade zu prüfen
   (v.a. bei installer-generierten Compose-Files / PostgreSQL). Neue/umbenannte
   `_APP_*`-Env-Vars mergen, nicht blind überschreiben.
2. **Legacy-Realtime während der Übergangszeit** — unser aktueller Custom-WebSocket
   nutzt das Legacy-Protokoll (`channels[]` in der Connect-URL). Das sollte unter
   1.9.5 weiter funktionieren (additive Änderungen), ist aber **nach dem Upgrade
   zu verifizieren** (NotificationBell + Live-Kommentare), BEVOR wir umbauen.
   Falls es bricht, wird der SDK-Rückbau dringend statt optional.
3. **Migration ist Pflicht** — auch von 1.9.0: `docker compose exec appwrite migrate`.
   Dauer hängt vom Datenvolumen ab (multi-threaded → mehr CPU-Kerne = schneller).
4. **Backup zwingend** vor der Migration (DB + Volumes). Migration ist nicht
   trivial rückrollbar.
5. **Eigene Instanz pro App** (Konzept) — falls mehrere Appwrite-Instanzen laufen,
   Upgrade pro Instanz, zuerst Dev, dann Prod.

## Upgrade-Prozedur (auf dem Appwrite-Host, nicht in diesem Repo)

> Direktes 1.9.0 → 1.9.5 ist erlaubt (Patch innerhalb derselben Minor; die
> „über jede Minor"-Regel gilt nur beim Überspringen von Minors).

1. **Backup** — DB + Storage-Volumes sichern; Snapshot des Hosts wenn möglich.
2. **Release-Notes lesen** — github.com/appwrite/appwrite/releases/tag/1.9.5.
3. **Upgrade-Container** im Appwrite-Parent-Verzeichnis:
   ```bash
   docker run -it --rm \
     --volume /var/run/docker.sock:/var/run/docker.sock \
     --volume "$(pwd)"/appwrite:/usr/src/code/appwrite:rw \
     --entrypoint="upgrade" \
     appwrite/appwrite:1.9.5
   ```
   (oder Web-Installer mit Migrations-Schritt / `--migrate`-Flag).
4. **Compose-/Env-Diff prüfen & mergen** (siehe Risiko 1), dann `docker compose up -d`.
5. **Migration ausführen:**
   ```bash
   cd appwrite/
   docker compose exec appwrite migrate
   ```
6. **Verifizieren** — alle Container zeigen 1.9.5, keine Fehler-Logs; Login,
   Kommentare, Realtime, Storage rauchtesten. Die Admin-System-Seite sollte
   1.9.5 anzeigen (der „veraltet"-Trigger verschwindet).

### Rollback
Container-Tags zurück auf 1.9.0 **nur** zusammen mit dem Daten-Backback von vor der
Migration (die Migration kann Schema/Daten transformieren). Ohne Backup kein
sauberer Rollback → deshalb Risiko 4.

## Danach: Projekt-Stellschrauben (phasiert, NACH dem Server-Upgrade)

> Reihenfolge bewusst: erst Server grün + Legacy-Realtime verifiziert, dann umbauen.

**P0 — Verifikation (kein Code)**
- Server auf 1.9.5, Migration grün, bestehende Realtime/Storage funktionieren.
- CLAUDE.md aktualisieren: „1.9.0" → „1.9.5", Realtime-/Presences-Notizen anpassen.

**P1 — Realtime-Rückbau aufs SDK (`useRealtimeRows`)**
- `useRealtimeRows` neu auf `new Realtime(client)` + `Channel.tablesdb(db).table(t).row(id?)`
  + 3. Param `queries` (server-seitiger Filter) statt Client-`where`.
- Aufrufer umstellen:
  - `NotificationBell`: `where: p => p.recipientId === uid` → `[Query.equal('recipientId', uid)]`.
  - `CommentSection`: `where: p => p.targetId===X && p.targetType===Y` →
    `[Query.equal('targetId', X), Query.equal('targetType', Y)]`.
  - Beide Filter sind mit den unterstützten Query-Ops (equal/notEqual/gt/lt/isNull/and/or)
    ausdrückbar.
- Gewinn: weniger Daten über die Leitung (server-seitig gefiltert), offizielles
  Protokoll, „channels/queries ohne Reconnect ersetzen" → behebt die heutige
  Reconnect-bei-Änderung-Limitierung. SSR-no-op-Guard + Backoff beibehalten.

**P2 — `usePresence` / Thread-Presence (net-new)**
- Implementieren via `upsertPresence()` (status + metadata `{ threadId, action:'viewing'|'typing' }`
  + expiry) + Subscribe `Channel.presences()` + Client-Heartbeat (~30 s).
- Ersetzt `useThreadPresence` + presence-Table mit manuellem Stale-Cleanup.
- Muster: [[appwrite-presences-realtime-reference]] (Memory) / Snapchat-Clone-Tutorial.

**P3 — Email-Policies (Console + optional Code)**
- In der Appwrite-Console pro Projekt unter **Auth → Security** aktivieren
  (Wegwerf-Adressen blocken, Corporate-Policy). Kein App-Code nötig.
- Optional: freundlichere i18n-Fehlermeldung im Signup, wenn eine Wegwerf-Adresse
  abgelehnt wird (statt generischem Fehler).

**P4 — Storage (kein/optional)**
- SDK ist bereits v26 → parallele Chunk-Uploads automatisch für große Dateien.
  Avatare sind klein → kein Effekt, kein Handlungsbedarf. Nur relevant, falls
  später große Uploads dazukommen.

## Nicht relevant
- **Self-Serve BAA** — HIPAA/Healthcare, Cloud-only, Pro-Plan ($350/mo), nur für PHI.
  Unser Projekt verarbeitet keine Gesundheitsdaten → ignorieren.
