# Cutover: Studio → Control (Maschine + Appwrite-Projekt)

Der **Code**-Teil ist erledigt und deployt (Layer `control`, App `control`,
`/api/control/*`, Feature-Key, i18n, Env-Namen). Offen ist nur noch, was
ausserhalb des Repos liegt: das Appwrite-Projekt und die ploi-Site.

Solange dieses Dokument offen ist, gilt: **die App heisst control, die
Maschine noch studio.** `deploy.yml` (SITE/SLOT) und
`ops/ecosystem-control.config.cjs` tragen deshalb bewusst noch die alten
Server-Pfade — beide sind in Schritt 6 die einzige Code-Aenderung.

## Warum ueberhaupt ein neues Appwrite-Projekt

Die Projekt-ID ist in Appwrite unveraenderlich. Sie steckt aber im
Session-Cookie (`a_session_<PROJECT_ID>`), also ist ein ID-Wechsel gleich-
bedeutend mit: **alle Sessions sind weg**. Beim Control Plane ist das genau
ein Konto (Davids), deshalb ist es billig — und deshalb macht man es jetzt
und nicht, wenn Kunden daran haengen.

Angelegt ist bereits: Projekt **`control`** ("Control") im Team *Pukalani App*.

## Voraussetzung

Die Kette besteht fast nur aus schreibenden Zugriffen auf Live-Infrastruktur
(ploi-API, Appwrite-Konsole, ssh auf `app-prod`). Ohne Bash-Berechtigung
dafuer bricht sie an jedem zweiten Schritt ab. Entweder eine
Berechtigungsregel setzen — oder die zwei Schluessel aus Schritt 1 von Hand
in Dateien legen, dann laeuft der Rest ueber Repo-Skripte und ssh.

**Geheimnisse gehen Datei zu Datei, nie durch den Chat.** Aus der Konsole per
Kopier-Knopf, lokal `pbpaste > datei`.

## Schritte

1. **Zwei Schluessel im Projekt `control`** — Scopes exakt wie im Projekt
   `studio` (dort nachgesehen, nicht geraten):
   - `nuxt-ssr-prod`: users.read/write, sessions.write, rows.read/write,
     files.read/write, health.read, presences.read/write
   - `migrations-prod`: databases/tables/columns/indexes je read+write,
     rows.read/write, buckets.read/write

   → `~/.appwrite-secrets/migrations/control.env` (Format wie jede App-.env).

2. **Schema anlegen:** `pnpm migrate --env-file ~/.appwrite-secrets/migrations/control.env`
   Migrationen sind idempotent (409 → skip), es gibt kein Ledger — der Lauf
   ist beliebig wiederholbar.

3. **Daten umziehen** (32 Rows): lesen mit dem alten Runtime-Key, schreiben
   mit dem neuen. `$createdAt` laesst sich beim Import NICHT setzen — die
   Zeitstempel starten neu. Fuer das Sites-Register und den Feature-Katalog
   ist das folgenlos; wo ein Datum fachlich zaehlt, steht es in einer eigenen
   Spalte.

4. **Konten:** Davids Betreiber-Konto wurde seinerzeit **ohne Passwort**
   angelegt (OTP-Login). Es gibt also keinen Hash umzuziehen — Konto mit
   derselben `$id` und E-Mail neu anlegen, prefs und Labels mitnehmen, fertig.

5. **Feature-Key nachziehen:** die Zeilen im Register und im
   `feature_catalog`, die noch `studio` als Feature fuehren, auf `control`
   umstellen — der Code kennt den Key seit der Umbenennung nur noch so.

6. **ploi-Site `control.pukalani.app`** (blue-green, das Alte bleibt bis zum
   Schluss unangetastet):
   - Alias `control.` von Site 390042 loesen (sonst Domain-Konflikt)
   - neue Site anlegen, `.env` serverseitig kopieren, darin
     `NUXT_PUBLIC_APPWRITE_PROJECT_ID=control`, den neuen Runtime-Key,
     `NUXT_PUBLIC_APP_URL=https://control.pukalani.app` — und
     `NUXT_CONTROL_ONBOARDING_SECRET` setzen, **das fehlt heute komplett**,
     womit der Self-Service-Trichter auf Prod stillsteht (der Code schliesst
     bei leerem Secret bewusst zu)
   - Zertifikat: klappt jetzt per HTTP-Pruefung, weil `control.` eine eigene
     Site mit eigenem Port-80-Eintrag wird. Genau daran war es im Juli
     gescheitert, als es nur ein Alias war
   - pm2 von 3003 umhaengen (wenige Sekunden Luecke), `studio.` als Alias
     mitnehmen — **daran haengt der Stripe-Webhook**
   - `deploy.yml` (SITE/SLOT) und `ops/ecosystem-control.config.cjs` auf die
     neuen Pfade, GitHub-Secret fuer den Deploy-Webhook nachziehen

7. **Falle:** das ploi-eigene Deploy-Script der Site 390042 baut noch
   `pnpm --filter studio build` nach `apps/studio/.output`. Die CI benutzt es
   nicht (sie rsynct), aber ein Klick auf „Deploy" im ploi-Panel wuerde
   fehlschlagen. Beim Cutover mit umschreiben.

8. **Erst wenn alles gruen ist:** altes Projekt `studio` und alte Site
   loeschen. Vorher `.env` und ein Row-Dump sichern.

## Abnahme

- `https://control.pukalani.app/api/health` meldet den erwarteten Commit
- Anmeldung per OTP funktioniert, Sites-Register und Health-Uebersicht sind
  vollstaendig
- `https://studio.pukalani.app` antwortet weiter (Stripe-Webhook)
- ein Stripe-Test-Event kommt an
- `packages/onboarding/scripts/verify-control-host.mjs` und
  `verify-site-authz.mjs` laufen gruen gegen den neuen Host

---

## Stand 2026-07-26: DURCHGEFÜHRT

Alle Schritte gelaufen, Beweise im Sitzungsprotokoll. Ergebnis:
- Projekt `control` live (Schema deckungsgleich per Diff, 25 Rows + Konto
  umgezogen, Keys in ~/.appwrite-secrets/control-*.key, Dump des Altprojekts
  in ~/.appwrite-secrets/backups/studio-final-dump.json — 32 Rows + 1 User).
- ploi-Site 392163 `control.pukalani.app` (nginx → 3003, LE-Zertifikat für
  control+studio per DNS-01), Alt-Site 390042 gelöscht, `studio.` = Alias.
- pm2 `controlpukalaniapp` läuft aus `releases/control/current` mit
  `.env` aus `/home/ploi/control.pukalani.app/` (inkl. Onboarding-Secret —
  der Self-Service-Trichter ist damit erstmals auf Prod OFFEN, per
  Precheck-Probe belegt). deploy.yml: SITE/SLOT auf control, ops/ per rsync.
- UptimeRobot-Monitor auf control umgestellt.

Zwei Lehren, beide in deploy.yml verewigt:
1. pm2 startOrReload findet Prozesse über den NAMEN — Umbenennung erzeugt
   einen Waisen auf demselben Port (gemischte Builds 6:4).
2. pm2 reload wendet einen geänderten script-Pfad NICHT an — Pfadwechsel
   braucht einmalig delete + start.

Offene Krümel:
- [ ] Appwrite-Projekt `studio` löschen — Modal war offen, letzter Klick
      liegt bei David (Löschung kann 500en → Memory „Provisioner"-Rezept).
- [ ] Server-Rest `/home/ploi/releases/studio/` entfernen (~150 MB).
- [ ] Bei Stripe-Live: Webhook-Endpoint auf control.pukalani.app umstellen,
      danach Alias `studio.` + Doppel-Zertifikat zurückbauen.
- [ ] GitHub-Secret PLOI_DEPLOY_WEBHOOK_STUDIO ist tot (Site gelöscht) —
      entfernen; für control gibt es bewusst keinen ploi-Webhook.
