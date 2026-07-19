# Deployment-Runbook — comments (Phase 17)

Stand: 2026-07-18 (Go-Live-Woche). Praktischer Leitfaden, um die App in
Produktion zu bringen. Ergänzt [CONCEPT.md](CONCEPT.md) (A9 Deployment,
A11 Env, A3 Session-Cookie) und
[plans/PHASE-17-PRODUCTION.md](plans/PHASE-17-PRODUCTION.md) (Checkliste +
alle Go-Live-Learnings im Detail).

> **Ist-Stand (pukalani.app):** App `comments.pukalani.app` (app-prod,
> 49.13.211.173, ploi-Site 389772) · Appwrite `api.pukalani.app`
> (appwrite-prod, 188.245.61.155, 1.9.5, Projekt-ID `comments`) · Cloudflare
> DNS „DNS only" · Resend-SMTP · UptimeRobot · Storage Box `maui-backup`
> (Offsite-Backups). Abweichungen vom ursprünglichen Plan, die sich bewährt
> haben: **pm2 statt systemd-Daemon** (ploi-NodeJS-Site, „Restart process
> after deployment"), **Port 3001** (von ploi vergeben), **corepack pnpm**
> statt npm-global, `NODE_OPTIONS=--max-old-space-size=4096` im
> Deploy-Script (Node-Default-Heap ~1,9 GB reicht dem Nuxt-Build nicht),
> Runtime-Env via `start-prod.sh`-Wrapper, der die Site-`.env` sourct
> (Nitro liest zur Laufzeit KEINE .env), HSTS als eigene Include-Datei
> `/etc/nginx/ploi/<site>/server/hsts.conf`.

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
   **Pflicht-Patch (Appwrite 1.9.5):** der mails-Worker verliert mit dem
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

## 3. ploi.io-Site konfigurieren (so läuft es in Prod)

| Feld | Wert (pukalani-Ist-Stand) |
|---|---|
| Site-Typ | NodeJS — ploi vergibt den Port (hier **3001**); nginx-vHost proxied NICHT automatisch → `location /` manuell auf `proxy_pass http://127.0.0.1:3001` + WebSocket-Header umstellen (Panel-nginx-Editor) |
| NodeJS-Service | PM2, Start command `bash start-prod.sh`, „Restart process after deployment" AN |
| Deploy-Script | `git pull` → `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0` → `export NODE_OPTIONS=--max-old-space-size=4096` → `corepack pnpm install --frozen-lockfile` → `corepack pnpm --filter comments build` (pm2-Restart macht ploi) |
| Reboot-Festigkeit | `pm2 save` einmalig + `@reboot pm2 resurrect` im ploi-Crontab (kein sudo nötig) |
| HSTS | eigene Include-Datei `server/hsts.conf` mit `add_header Strict-Transport-Security "max-age=15768000" always;` |

**Runtime-Env** liegt in `/home/ploi/<site>/.env` (chmod 600) und wird vom
`start-prod.sh`-Wrapper mit `set -a; source .env` in die Prozess-Umgebung
gehoben — Nitro liest zur Laufzeit keine .env-Datei:
```
NUXT_APPWRITE_KEY=<Runtime-Key>                     # server-only
NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.pukalani.app/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID=comments
NUXT_PUBLIC_APPWRITE_DATABASE_ID=main
NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars
NUXT_PUBLIC_APP_URL=https://comments.pukalani.app
NUXT_PUBLIC_I18N_BASE_URL=https://comments.pukalani.app
NUXT_SMTP_HOST=smtp.resend.com                      # + PORT/USER/PASS/FROM
```
> **NICHT** auf den Server: `NUXT_APPWRITE_MIGRATIONS_KEY`. Der gehört nur zum
> Migrationslauf (Schritt 2). Nach Env-Änderungen: `pm2 restart <prozess>`.

## 4. Deploy auslösen

- **Aktiv seit 2026-07-18:** jeder Push auf `main` → CI „Test" → Workflow
  „Deploy" ruft den ploi-Webhook (Repo-Secret
  `PLOI_DEPLOY_WEBHOOK_COMMENTS`) → ploi pullt, baut, restartet pm2.
  Kette e2e verifiziert. ploi Quick Deploy bleibt bewusst AUS (Deploy nur
  nach grünem Test).
- **Härtung seit 2026-07-19:** ploi verschluckt Webhooks, die während eines
  laufenden Deploys eintreffen (beobachtet bei zwei Pushes binnen ~3 min).
  `/api/health` liefert deshalb den gebauten Commit (`build`, zur Build-Zeit
  aus git), und der Deploy-Workflow pollt nach dem Webhook bis Prod den
  erwarteten SHA meldet (~13 min Timeout) — ein verlorener Deploy macht den
  Workflow ROT statt still zu bleiben. Abhilfe dann: Workflow re-runnen.
- ploi-„Health check URL" der Site steht auf
  `https://comments.pukalani.app/api/health` → Mail bei Nicht-200 nach Deploy.

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
