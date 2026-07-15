# M4 — `pnpm create-site` + Gate G1/S1 (Umsetzungsplan)

Stand: 2026-07-14 · Status: **in Umsetzung** (Go David)
Kontext: Strategie P1 — eine neue Studio-Site in EINEM Befehl statt 5–10
Handschritten; Gate G1 = Spike S1 (Projekt-Anlage per Console-API) bestanden.

## Was `pnpm create-site <name>` tut

1. **Scaffold** aus `apps/_template` (ohne node_modules/.nuxt/.env):
   package.json (Name, Port, @maui-Dependencies = Feature-Wahl),
   nuxt.config.ts (extends in kanonischer EXTENDS_ORDER, Port),
   site.manifest.ts (generiert). Port = nächster freier 30xx.
2. **Feature-Validierung** vor dem Scaffold: Manifest existiert,
   requires-Schluss erfüllt (comments ohne moderation → Abbruch mit Hinweis).
3. **Appwrite-Provisionierung** (Console-REST; Zugang über
   `APPWRITE_CONSOLE_EMAIL`/`-PASSWORD`, sonst Skip + manuelle Checkliste):
   Organisation `maui-sites` (idempotent) → Projekt **`<name>-<shortid>`**
   (F6: unveränderliche ID, Slug getrennt) → zwei Keys
   (`runtime-<name>`/`migrations-<name>` — Key-IDs GLOBAL eindeutig,
   S0-Learning) → Web-Platform localhost → `.env` komplett geschrieben.
4. **pnpm install** (Workspace-Link) + **Bootstrap** (DB main, Buckets,
   Migrationen) — der Migrations-Runner filtert dabei neu nach dem
   **Site-Manifest**: nur gewählte Features + system werden migriert
   (eine Site ohne courses bekommt keine courses-Tables).
5. **check:manifests** als Schlussgate — die generierte Site muss die
   eigene CI-Prüfung bestehen.

## Nebenänderungen

- `scripts/migrate.mjs`: Manifest-Filter (ohne explizite `--layer`-Wahl);
  Root-Script + Bootstrap-Aufrufe mit `--experimental-strip-types`.
- Fallback ohne Console-Zugang: Scaffold + gedruckte Handschritte
  (Console-Projekt, Keys, Platform, bootstrap-Kommando).

## Gate G1/S1 — Abnahme

`create-site` läuft end-to-end gegen eine ECHTE Wegwerf-Appwrite
(ci/appwrite, Port 8081, Console-Account aus S0): Projekt+Keys+Platform
per Console-REST, Bootstrap migriert nur die gewählten Features, die neue
App bootet auf ihrem Port, check:manifests bleibt grün.

## Ergebnis (2026-07-14)

- **Scaffold-Pfad lokal bewiesen:** `pnpm create-site s1-probe
  --skip-appwrite` erzeugt eine App, die `check:manifests` besteht
  („13 Layer, 3 Apps — konsistent"), inkl. korrekter extends-Reihenfolge,
  @maui-Dependencies und Port-Vergabe.
- **Gate G1/S1 läuft dauerhaft in der CI** (e2e.yml, Schritt „Gate G1"):
  create-site provisioniert bei jedem Push ein frisches Projekt auf der
  echten CI-Wegwerf-Appwrite (Console-REST: Org → Projekt → 2 Keys →
  Platform), schreibt .env, bootstrapt mit **manifest-gefilterten**
  Migrationen und endet mit check:manifests. Damit ist S1 nicht einmalig,
  sondern bei jedem Appwrite-/Script-Update erneut bewiesen — genau der
  „CI-Smoke-Test", den die Strategie für die Console-API forderte.
- **Warum nicht lokal end-to-end:** Die lokale Wegwerf-Instanz auf der
  4-GB-OrbStack-VM (parallel zur Haupt-Instanz) crashte reproduzierbar
  unter der teuren Projekt-Anlage. Zwei wertvolle Provisioner-Learnings:
  (a) 408 bei Projekt-Anlage ⇒ **pollen statt abbrechen** (eingebaut,
  funktionierte); (b) ein 408-unterbrochenes Anlegen kann ein **halb
  initialisiertes Projekt** hinterlassen (Folge-Calls → 500 auf fehlende
  interne Tables) — Bestätigung für die P2-Anforderung „kompensierende
  Aktion/markierte Reparatur", der Provisioner (M7) muss solche Projekte
  erkennen und löschen statt weiterzuverwenden.
