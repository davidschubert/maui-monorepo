# Deployment-Runbook — Prod-Sites (Phase 17 / H2)

Stand: 2026-07-19 (Multi-Site). Praktischer Leitfaden, um Apps in
Produktion zu bringen. Ergänzt [CONCEPT.md](CONCEPT.md) (A9 Deployment,
A11 Env, A3 Session-Cookie) und
[plans/PHASE-17-PRODUCTION.md](plans/PHASE-17-PRODUCTION.md) (Checkliste +
alle Go-Live-Learnings im Detail).

> **Ist-Stand (pukalani.app), EIN App-Server (app-prod, 49.13.211.173) mit
> VIER ploi-Sites:** `comments.pukalani.app` (Site 389772, Port **3001**) ·
> `portfolio.pukalani.app` (Site 390041, Port **3002**) ·
> `studio.pukalani.app` (Site 390042, Port **3003**) ·
> `platform.pukalani.app` (Site 391312, Port **3004**, seit H3-Rollout
> 2026-07-23 — Multi-Tenant-App: `server_name platform.pukalani.app
> *.pukalani.app` + ploi-verwaltetes **Wildcard-TLS** `*.pukalani.app`
> via DNS-Challenge; jede Kunden-Subdomain landet hier und wird über das
> tenants-Register des studio-Control-Plane aufgelöst,
> NUXT_PLATFORM_CONTROL_*-Env). Appwrite
> `api.pukalani.app` (appwrite-prod, 188.245.61.155, 1.9.6) mit **einem
> Projekt je Site** (`comments`, `portfolio`, `studio` — F6-Muster
> Projekt-pro-Site, je eigene nuxt-ssr-prod/migrations-prod-Keys +
> Web-Platform) **plus** dem geteilten Pool-Projekt `pool` (H3: eine
> Appwrite-Instanz/DB für alle Pool-Tenants, Zeilen-Scope per tenantId). Cloudflare DNS „DNS only" · Resend-SMTP (nur comments +
> studio) · UptimeRobot · Storage Box `maui-backup` (Offsite-Backups; die
> MariaDB-Dumps decken alle Projekte ab).
> Bewährte Abweichungen vom ursprünglichen Plan: **pm2 Cluster-Mode über
> `ops/ecosystem-<app>.config.cjs`** (seit A.10 Stufe 2 — parst die
> Site-`.env`, Nitro liest zur Laufzeit KEINE .env), **corepack pnpm**,
> `NODE_OPTIONS=--max-old-space-size=4096` im Deploy-Script (Node-Default-
> Heap ~1,9 GB reicht dem Nuxt-Build nicht), HSTS als eigene Include-Datei
> `/etc/nginx/ploi/<site>/server/hsts.conf`.
>
> **RAM-Regel (2 Cores / 3,7 GB + 4,7 GB Swap):** ein Nuxt-Build braucht
> ~3,4 GB — **nie zwei Builds parallel** (beobachteter OOM-Kill 137).
> deploy.yml deployt die vier Sites deshalb SEQUENZIELL und wartet je Site
> auf den buildSha-Beweis, bevor die nächste startet. Die platform-App
> bündelt die meisten Layer und braucht im Deploy-Script
> `--max-old-space-size=3584` (2560 und 3072 OOMten beim Nitro-Bundling,
> beobachtet 2026-07-23 — der Überhang läuft in den Swap).

> **Architektur:** Nuxt 4 (SSR) → Nitro Node-Server. Build erzeugt
> `apps/comments/.output/server/index.mjs`. Backend = eigene self-hosted
> Appwrite-Instanz. Hosting/Deploy über **ploi.io**.

---

## 0. Vorab sammeln (deine Checkliste)

Bevor wir starten, brauchst du:

- [ ] **Server** (Hetzner o.ä.), von ploi.io verwaltbar (SSH-Zugang an ploi.io)
- [ ] **ploi.io-Account** mit dem Server verbunden
- [ ] **Domain** + die Möglichkeit, DNS zu setzen. **Wichtig (A3):** App und
      Appwrite müssen auf **derselben Root-Domain** liegen, z.B.
      App `comments.example.com`, Appwrite `api.example.com` → Cookie-Domain
      `.example.com`. Sonst läuft das authentifizierte Realtime nicht.
- [ ] **Prod-Appwrite** (self-hosted, ≥1.9.0) auf dem Server (Docker) erreichbar
      unter der Appwrite-Subdomain mit TLS
- [ ] **SMTP-Zugang** für Appwrite (Verifizierungs-/Recovery-/OTP-Mails) —
      z.B. ein Transaktions-Mail-Anbieter

Sag mir, sobald das steht — dann gehen wir die Schritte gemeinsam durch.

---

## 1. Prod-Appwrite einrichten (Console)

1. **Projekt** anlegen → Project ID notieren.
2. **Database** anlegen → Database ID notieren.
3. **Platforms / Domains** (CORS + OAuth + Cookie): die App-Domain UND die
   Appwrite-Domain als Web-Platform registrieren. Bei self-hosted 1.9.0:
   *Multiple Application Domains* nutzen.
4. **Zwei API-Keys** (Konzept A2; Scope-Liste 2026-07-18 präzisiert):
   - **Runtime-Key** (`nuxt-ssr-prod`): `sessions.write`, `users.read`,
     `users.write`, `rows.read`, `rows.write`, `health.read` **plus**
     `files.read`, `files.write` (Avatar-Upload + GDPR-Snapshot laufen über
     den Admin-Client) und `presences.read`, `presences.write`
     (Presence-Heartbeat/Reader) — 10 Scopes.
   - **Migrations-Key** (`migrations-prod`): `databases.*`, `tables.*`,
     `columns.*`, `indexes.*` **plus** `buckets.*` (der Bootstrap legt die
     Buckets an) **plus** `rows.read`, `rows.write` (Migrationen seeden
     Default-Rows und machen Row-Backfills — Prod-Learning 2026-07-19) —
     12 Scopes. **Nur für den Migrationslauf** — kommt NIE auf den
     App-Server.
5. **SMTP** in der Appwrite-Installation (`.env` der Instanz, nicht in der
   Console) konfigurieren, sonst keine Auth-Mails.
   **Pflicht-Patch (Appwrite 1.9.5/1.9.6):** der mails-Worker verliert mit dem
   hartkodierten SMTP-`keepAlive: true` still die ERSTE Mail nach einer
   Leerlaufphase (PHPMailer-`false` wird verschluckt, Worker loggt trotzdem
   „success") — auf beiden Instanzen mountet `docker-compose.override.yml`
   deshalb eine gepatchte `registers.php` (`keepAlive: false`) in
   `appwrite-worker-mails`. Details/Beweis: PHASE-17-PRODUCTION.md Block 7.
   Beim Upgrade Patch neu ziehen oder entfernen, falls upstream gefixt.
6. **TLS** für die Appwrite-Subdomain (ploi.io/Caddy/Traefik) — Cookie braucht `secure`.

## 2. Migrationen gegen Prod laufen lassen

Migrationen laufen **von einer vertrauenswürdigen Maschine** (lokal/CI) gegen den
Prod-Endpoint — mit dem **Migrations-Key**, nicht vom App-Server aus.

```bash
# Prod-Werte in eine separate Datei (NICHT committen; .gitignore deckt .env*):
cp apps/comments/.env.example apps/comments/.env.production
#   → NUXT_PUBLIC_APPWRITE_ENDPOINT = https://api.pukalani.app/v1
#   → NUXT_PUBLIC_APPWRITE_PROJECT_ID = comments · _DATABASE_ID = main
#   → NUXT_APPWRITE_MIGRATIONS_KEY = Prod-Migrations-Key

# EIN Befehl: Datenbank + Buckets + alle Migrationen
# (system→comments→moderation→admin), idempotent (409→skip).
nvm use 22
node --experimental-strip-types --env-file=apps/comments/.env.production \
  apps/comments/scripts/bootstrap.ts        # OHNE --seed (Prod!)
```

> Tabellen-Owner: **system** (audit_logs, app_config, notifications) ·
> **comments** (comments, comment_votes) · **moderation** (reports) ·
> **admin** (changelog). `core`/`themes` haben keine Tables. Der Bootstrap
> legt auch den `avatars`-Bucket an (daher braucht der Migrations-Key
> `buckets.*`).

**Bootstrap-Admin:** der erste Owner braucht das `admin`-Label. In der Appwrite
Console beim eigenen User unter *Labels* `admin` setzen (Self-Lockout-Schutz greift
danach).

### 2b. Wellen-Migrationen (H3-4.2 — Multi-Tenant-Schema-Rollouts)

Sobald FREMDE Silo-Projekte existieren, rollen Schema-Änderungen in **drei
Wellen** aus; der **Pool migriert immer genau einmal** (ein geteiltes Projekt,
`pnpm migrate --env-file <pool-migrations.env>`). Die Welle eines Tenants
steht im tenants-Register (`wave`: internal → canary → stable, Studio-UI
„Update-Welle", nur für Silos wirksam; Bestand = stable).

```bash
# Silo-Projekte einer Welle migrieren (Reihenfolge: internal → canary → stable)
pnpm migrate --wave internal --control-env apps/studio/.env.production
pnpm migrate --wave canary   --control-env apps/studio/.env.production
pnpm migrate --wave stable   --control-env apps/studio/.env.production
```

- `--control-env` = Env der **Control-Plane-Instanz** (studio) — daraus kommen
  die Silo-Projekte der Welle. Nie raten, immer explizit.
- Je Silo-Projekt braucht der Runner eine Migrations-Env-Datei
  `~/.appwrite-secrets/migrations/<projectId>.env` (Format wie jede App-.env:
  `NUXT_PUBLIC_APPWRITE_*` + `NUXT_APPWRITE_MIGRATIONS_KEY`; `--keys-dir`
  überschreibt den Ordner). Fehlt eine, bricht der Lauf ab, BEVOR irgendein
  Projekt migriert wird (keine halbe Welle).
- **Disziplin:** Migrationen sind ADDITIV (Code n-1 verträgt Schema n) —
  erst die Spalte überall, dann der Code-Deploy, Aufräumen später. Beispiel
  2026-07-23: `tenants.wave` (studio-012) lief auf Prod, BEVOR der Code
  deployt wurde, der das Feld schreibt.
- disabled-Tenants migrieren mit (ein reaktivierter Host braucht aktuelles
  Schema); mehrere Hosts pro Projekt werden dedupliziert.

## 3. ploi.io-Site konfigurieren (so läuft es in Prod)

| Feld | Wert (pukalani-Ist-Stand) |
|---|---|
| Site-Typ | NodeJS — ploi vergibt den Port (hier **3001**); nginx-vHost proxied NICHT automatisch → `location /` manuell auf `proxy_pass http://127.0.0.1:3001` + WebSocket-Header umstellen. **Robuster Weg (Learning 2026-07-23): die ploi-API statt des Panel-Editors** — `GET/PATCH /api/servers/{srv}/sites/{site}/nginx-configuration` (JSON `{"content": …}`) + `POST /api/servers/{srv}/services/nginx/restart`; der Monaco-Editor im Panel lässt sich nicht zuverlässig automatisiert befüllen. Auch Deploy-Script (`…/deploy/script`) und Deploy-Trigger (`POST …/deploy`) gehen per API |
| NodeJS-Service | pm2 **Cluster-Mode** via [`ops/ecosystem-comments.config.cjs`](../ops/ecosystem-comments.config.cjs) (seit 2026-07-19, Zero-Downtime Stufe 2). „Restart process after deployment" **AUS** — den Prozesswechsel macht `pm2 reload` im Deploy-Script. ploi-Start-command `bash start-prod.sh` ist nur noch historischer Rest (ploi startet nichts mehr) |
| Deploy-Script | `git pull` → corepack-Install/Build wie gehabt → **dann Release-Flow**: `.output` nach `/home/ploi/releases/comments/<sha>/` kopieren, `current`-Symlink atomar flippen (`ln -s` + `mv -Tf`), `pm2 startOrReload ops/ecosystem-comments.config.cjs --update-env`, `pm2 save`, alte Releases auf 5 stutzen. Der alte Worker serviert bis der neue `listening` ist → **kein 502**, und der laufende Prozess liest nie aus einem halb überschriebenen `.output` |
| Reboot-Festigkeit | `pm2 save` macht das Deploy-Script; `@reboot pm2 resurrect` im ploi-Crontab (kein sudo nötig) |
| HSTS | eigene Include-Datei `server/hsts.conf` mit `add_header Strict-Transport-Security "max-age=15768000" always;` |

**Runtime-Env** liegt in `/home/ploi/<site>/.env` (chmod 600) und wird von
`ops/ecosystem-comments.config.cjs` beim `pm2 startOrReload … --update-env`
geparst und in die Prozess-Umgebung gehoben — Nitro liest zur Laufzeit keine
.env-Datei:
```
NUXT_APPWRITE_KEY=<Runtime-Key>                     # server-only
NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.pukalani.app/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID=comments
NUXT_PUBLIC_APPWRITE_DATABASE_ID=main
NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars
NUXT_PUBLIC_APP_URL=https://comments.pukalani.app
NUXT_PUBLIC_I18N_BASE_URL=https://comments.pukalani.app
NUXT_SMTP_HOST=smtp.resend.com                      # + PORT/USER/PASS/FROM
NUXT_REDIS_URL=redis://127.0.0.1:6379               # geteilter Rate-Limit-Store
```
> **Rate-Limit-Store (seit 2026-07-23):** mit `NUXT_REDIS_URL` zählen alle
> Instanzen/Cluster-Worker einer App ihre Rate-Limits GETEILT in Redis
> (läuft auf app-prod lokal auf 6379, bei der Server-Einrichtung
> mitinstalliert); Keys sind pro Appwrite-Projekt gescoped (`rl:<projekt>:…`),
> mehrere Sites teilen also gefahrlos EINE Redis-Instanz. Leer = In-Memory
> pro Instanz (Dev). Fail-open: stirbt Redis, drosselt der In-Memory-Fallback
> weiter (lautes Log) — nie 500er wegen Redis.
> **NICHT** auf den Server: `NUXT_APPWRITE_MIGRATIONS_KEY`. Der gehört nur zum
> Migrationslauf (Schritt 2). Nach Env-Änderungen: `pm2 startOrReload
> /home/ploi/comments.pukalani.app/ops/ecosystem-comments.config.cjs
> --update-env` (downtime-frei; ein `pm2 restart` ginge auch, reißt aber
> eine Lücke).

## 4. Deploy auslösen

- **CI-BUILD-DEPLOY (seit 2026-07-23, ersetzt den Webhook-Weg):** jeder
  Push auf `main` → CI „Test" → Workflow „Deploy" **baut alle 4 Apps auf
  dem Actions-Runner** (Node aus `.nvmrc`, pnpm-Cache) und schiebt nur das
  fertige `.output` per rsync nach `/home/ploi/releases/<app>/<sha>/`,
  dann der bekannte ZDT-Flip (Symlink + `pm2 startOrReload` + Prune) und
  Health-Verify je App. **Der App-Server baut damit NICHTS mehr** — die
  RAM-Regel oben gilt nur noch für den Fallback. Zugang: dedizierter
  SSH-Deploy-Key (Repo-Secret `PLOI_SSH_KEY`, gepinnter Host-Key im
  Workflow; Schlüsselpaar lokal in `~/.maui-secrets/gh-deploy-key`).
  Das `git pull` im Site-Checkout hält nur noch ops-Configs aktuell.
- **Fallback (Server baut selbst):** die ploi-Deploy-Scripts der 4 Sites
  sind unverändert funktionsfähig — bei Actions-Ausfall in ploi den
  Deploy-Button drücken (oder Webhooks feuern; Secrets
  `PLOI_DEPLOY_WEBHOOK_*` existieren weiter). Dann gilt die RAM-Regel
  (sequenziell, platform braucht 3584 MB Heap).
  ploi Quick Deploy bleibt bewusst AUS, „Restart after deployment" AUS.
  Hinweis platform: `/api/health` ist bei aktiver Tenancy bewusst von der
  Tenant-Pflicht ausgenommen (Middleware-Ausnahme in core), sonst könnte
  das Deploy-Verify den kanonischen Site-Host nicht pollen.
- **Härtung seit 2026-07-19:** ploi verschluckt Webhooks, die während eines
  laufenden Deploys eintreffen (beobachtet bei zwei Pushes binnen ~3 min).
  `/api/health` liefert deshalb den gebauten Commit (`build`, zur Build-Zeit
  aus git), und der Deploy-Workflow pollt nach dem Webhook bis Prod den
  erwarteten SHA meldet (~13 min Timeout) — ein verlorener Deploy macht den
  Workflow ROT statt still zu bleiben. Abhilfe dann: Workflow re-runnen.
- ploi-„Health check URL" der Site steht auf
  `https://comments.pukalani.app/api/health` → Mail bei Nicht-200 nach Deploy.
- **Zero-Downtime Stufe 2 (seit 2026-07-19):** Deploys erzeugen ein
  eingefrorenes Release unter `/home/ploi/releases/comments/<sha>/` und
  wechseln per Symlink-Flip + `pm2 reload` (Cluster-Mode). Beweis: curl-Loop
  auf `/api/health` alle ~0,3 s über einen kompletten Deploy — 0 Nicht-200.
  Rollback im Notfall: `current`-Symlink auf ein älteres Release zeigen
  lassen + `pm2 reload commentspukalaniapp` (die letzten 5 Releases bleiben
  liegen).

## 5. Verifikation nach dem Deploy

- [ ] `GET https://<app-domain>/api/health` → ok
- [ ] Registrierung + Login (Session-Cookie `a_session_<PROJECT_ID>`, httpOnly+secure)
- [ ] **E-Mail-Verifizierung** (seit 2026-07-19, `maui.auth.verification`):
      Signup verschickt die Bestätigungs-Mail (Instanz-SMTP), Banner erscheint
      eingeloggt, `/verify`-Link bestätigt. Mails an Notifications
      (instant/digest) gehen NUR an verifizierte Adressen.
- [ ] Kommentar erstellen / voten / antworten
- [ ] **Realtime:** zweiter Browser sieht neuen Kommentar live (bestätigt die
      Same-Root-Domain-Cookie-Konfiguration aus A3)
- [ ] Melden → Moderations-Queue im Dashboard (als `admin`/`moderator`)
- [ ] Reply-Notification verlinkt auf die richtige Seite (`targetUrl`)
- [ ] Öffentliche `/changelog`-Seite rendert
- [ ] Browser-Bundle enthält **keine** Secrets (DevTools → Sources nach `NUXT_APPWRITE_KEY` suchen → nichts)

---

## Env-Var-Referenz

| Variable | Ort | Geheim? | Zweck |
|---|---|---|---|
| `NUXT_APPWRITE_KEY` | App-Server (ploi.io) | **ja** | Runtime-Key (SSR/Auth/CRUD) |
| `NUXT_APPWRITE_MIGRATIONS_KEY` | nur Migrationslauf | **ja** | Schema-Migrationen — **nie** auf den App-Server |
| `NUXT_PUBLIC_APPWRITE_ENDPOINT` | App-Server + Build | nein | Appwrite-URL |
| `NUXT_PUBLIC_APPWRITE_PROJECT_ID` | App-Server + Build | nein | Projekt |
| `NUXT_PUBLIC_APPWRITE_DATABASE_ID` | App-Server + Build | nein | Datenbank |
| `NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET` | App-Server + Build | nein | Profilfoto-Bucket |
| `NUXT_PUBLIC_APP_URL` | App-Server + Build | nein | öffentliche App-URL |

`NUXT_PUBLIC_*` landen bewusst im Client-Bundle. Alles ohne `PUBLIC_` bleibt server-seitig.
