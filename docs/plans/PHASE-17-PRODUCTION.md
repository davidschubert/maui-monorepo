# Phase 17 — Production Deployment (Hetzner + ploi.io + Custom Domain)

Stand: 2026-07-01. **Plan-Dokument — kein Code.** Ergänzt das bestehende Runbook
[DEPLOYMENT.md](../DEPLOYMENT.md) (Console-Setup, Migrationen, ploi-Site-Felder,
Env-Referenz) und [CONCEPT.md](../CONCEPT.md) A3/A9/A10/A11/A12. Dieses Dokument
beantwortet die Infrastruktur-Fragen, die das Runbook offen lässt (Server-Zuschnitt,
DNS/TLS, Backups, Monitoring, Hardening, Realtime-Watchdog) und liefert die
abhakbare Betreiber-Anleitung.

**Platzhalter durchgängig:** `example.com` = Root-Domain,
`comments.example.com` = App, `api.example.com` = Appwrite.
Beide MÜSSEN auf derselben Root-Domain liegen (Session-Cookie
`a_session_<PROJECT_ID>` mit Domain `.example.com`, sonst kein
authentifiziertes Realtime — CONCEPT A3, CLAUDE.md).

> **ENTSCHIEDEN (2026-07-17, David):** Root-Domain = **`pukalani.app`**
> (vorhanden, über Cloudflare registriert → DNS liegt bei Cloudflare,
> `api.pukalani.app` zwingend „DNS only"/graue Wolke). Erste App:
> **comments** (`comments.pukalani.app` + `api.pukalani.app`); die App heißt
> projektweit `comments` (vormals reddit-comments — die Appwrite-Projekt-ID
> der DEV-Instanz bleibt `reddit-comments`, unveränderliche F6-Identität;
> das Prod-Projekt wird frisch als `comments` angelegt). Reihenfolge:
> **erst portfolio bauen, dann PHASE-17 in einem Rutsch, danach M8-Stripe.**
> Root-Domain: vorerst Redirect auf die App, Landingpage später.
> Alle A.10-Entscheidungen unten sind gefallen.

---

## TEIL A — Technischer Plan

### A.1 Zielarchitektur: zwei Server (empfohlen)

```
                    DNS example.com
        ┌──────────────────┴──────────────────┐
comments.example.com                  api.example.com
        │                                     │
┌───────▼────────────┐              ┌─────────▼──────────────┐
│ Server 1 „app"     │              │ Server 2 „appwrite"    │
│ Hetzner CX22       │   HTTPS/WSS  │ Hetzner CX32           │
│ ploi.io-managed    │─────────────▶│ NICHT ploi-provisioned │
│ nginx + LE-TLS     │  (SSR-API-   │ Appwrite 1.9.5 Docker  │
│ Nitro Node-Server  │   Calls +    │ Traefik + LE-TLS       │
│ (Daemon, Port 3000)│   Browser-   │ MariaDB/Redis/Worker   │
│ GitHub→Webhook     │   Realtime)  │ + realtime-Watchdog    │
└────────────────────┘              └────────────────────────┘
```

**Empfehlung: Appwrite und Nuxt auf GETRENNTEN Hetzner-VMs.** Begründung:

1. **Port-/Proxy-Konflikt vermeiden (Hauptgrund):** ploi.io provisioniert seinen
   Server mit eigenem nginx auf 80/443. Der Appwrite-Docker-Stack bringt seinen
   eigenen Traefik mit, der ebenfalls 80/443 binden will (und die
   Let's-Encrypt-Zertifikate für die Appwrite-Domain selbst managt). Auf EINEM
   Server müsste man entweder Traefik auf Alternativ-Ports legen und nginx
   davor proxien (WebSocket-Upgrade + TLS-Weiterreichung fehleranfällig, von
   Appwrite nicht der dokumentierte Weg) oder ploi ohne nginx betreiben (dann
   verliert ploi seinen Nutzen). Zwei Server = jede Komponente läuft exakt im
   dokumentierten Standard-Setup.
2. **Ressourcen-Isolation:** Appwrite (MariaDB, Redis, ~15 Container, Worker)
   ist der Speicherfresser; der Nitro-Server ist genügsam. Ein Appwrite-Lastpeak
   oder der bekannte Swoole-Crash des realtime-Containers zieht die App nicht mit
   runter — und umgekehrt kann ein Deploy-Build (pnpm install + nuxt build) nicht
   die Appwrite-DB verhungern lassen.
3. **Unabhängige Lebenszyklen:** Appwrite-Upgrades (Backup → upgrade →
   `migrate`, siehe [APPWRITE-1.9.5-UPGRADE.md](../APPWRITE-1.9.5-UPGRADE.md))
   und App-Deploys (mehrmals täglich) haben völlig verschiedene Rhythmen und
   Backup-Anforderungen.
4. **Konzept-Konformität:** „Jede App: EIGENE Appwrite-Instanz" (CLAUDE.md) —
   ein dedizierter Appwrite-Server pro App skaliert dieses Modell sauber;
   App 2 (Port 3002+) bekommt später ihre eigene Instanz, während sich mehrere
   dünne Nuxt-Apps notfalls Server 1 teilen können.

**Dimensionierung (Hetzner Cloud, Shared vCPU x86):**

| Rolle | Typ | Specs | Preis (ca.) |
|---|---|---|---|
| Server 1 „app" | **CX22** | 2 vCPU / 4 GB / 40 GB | ~4 €/Monat |
| Server 2 „appwrite" | **CX32** | 4 vCPU / 8 GB / 80 GB | ~7 €/Monat |

Appwrite nennt 2 vCPU/4 GB als Minimum — CX32 gibt Luft für MariaDB, die
`migrate`-Läufe (multi-threaded) und die Worker. Upgrade auf CX42 ist bei
Hetzner ein Resize ohne Neuinstallation. Standort: Nürnberg oder Falkenstein
(EU, geringe Latenz zwischen beiden VMs; beide ins selbe **private Hetzner
Cloud Network** legen, damit App→Appwrite-SSR-Traffic intern laufen KÖNNTE —
initial läuft er bewusst über die öffentliche `api.example.com`-URL, weil das
Session-Cookie/Realtime-Setup genau eine Endpoint-URL kennt; das private Netz
ist die spätere Optimierung).

**Bewusst verworfen:**
- *Alles auf einem Server:* Port-80/443-Konflikt ploi-nginx ↔ Appwrite-Traefik
  (s.o.), Backup-/Blast-Radius vermischt. Ersparnis ~4 €/Monat — lohnt nicht.
- *Appwrite Cloud:* Projekt ist explizit self-hosted (1.9.5-Features wie
  Presences sind self-hosted verifiziert, Console-Whitelist, volle Kontrolle).
- *App-Server auch von ploi wegnehmen:* ploi liefert genau das, was wir für
  Nuxt brauchen (nginx-vHost, LE-Zertifikat, Daemon-Supervision, Deploy-Webhook,
  Monitoring) — für Appwrite dagegen liefert es nichts, was Traefik nicht
  selbst kann.

### A.2 DNS & TLS

| Record | Typ | Ziel | Zweck |
|---|---|---|---|
| `comments.example.com` | A | IP Server 1 | App |
| `api.example.com` | A | IP Server 2 | Appwrite-Endpoint |
| optional `www.example.com` / Root | A/ALIAS | IP Server 1 | Redirect auf App |

- **Kein Proxy/CDN (orange Cloudflare-Wolke) vor `api.example.com`** zum Start:
  Realtime-WebSockets + Traefik-ACME-Challenge sollen direkt durchlaufen.
  (Cloudflare „DNS only" ist ok.)
- TLS App: ploi.io stellt Let's-Encrypt-Zertifikat pro Site aus (HTTP-01,
  auto-renew). TLS Appwrite: Traefik holt das Zertifikat selbst, gesteuert über
  `_APP_DOMAIN=api.example.com`, `_APP_DOMAIN_TARGET=api.example.com`,
  `_APP_ENV=production`, `_APP_OPTIONS_FORCE_HTTPS=enabled` in der
  Appwrite-`.env`. Voraussetzung: DNS zeigt schon auf den Server, Port 80 offen.
- Cookie-Kette (A3): Appwrite setzt das Session-Cookie für `.example.com`,
  weil `api.example.com` und `comments.example.com` dieselbe Root-Domain
  teilen → SSR-Login, Browser-Realtime (JWT-Socket) und der bewusst
  cookie-native `useRealtimeAccount`-WS funktionieren nur so.
- TTL vor der Umstellung auf 300 s senken; A-Records brauchen je nach Registrar
  Minuten bis Stunden (⏳ im Teil B markiert).

### A.3 Appwrite-Prod-Instanz (Server 2)

1. **Installation:** Docker + Docker Compose (Ubuntu 24.04 LTS), dann Appwrite
   **1.9.5** (gleiche Version wie dev — kein gleichzeitiges Versions-Upgrade
   mit dem Go-Live mischen) via `docker run … appwrite/appwrite:1.9.5` Installer.
   Wichtige `.env`-Werte der Instanz:
   - `_APP_ENV=production`, `_APP_DOMAIN`/`_APP_DOMAIN_TARGET=api.example.com`,
     `_APP_OPTIONS_FORCE_HTTPS=enabled`
   - `_APP_CONSOLE_WHITELIST_ROOT=enabled` (nur der erste Account darf sich an
     der Console registrieren) und zusätzlich
     `_APP_CONSOLE_WHITELIST_EMAILS=mail@davidschubert.com` — Erfahrungswert
     aus dem 1.9.5-Umstieg (Console-Whitelist war dort schon Thema)
   - `_APP_OPTIONS_ABUSE=enabled` (eingebaute Rate-Limits aktiv lassen)
   - **SMTP** (`_APP_SMTP_HOST/PORT/SECURE/USERNAME/PASSWORD`,
     `_APP_SYSTEM_EMAIL_ADDRESS`) — ohne SMTP keine Verify-/Recovery-/OTP-Mails.
     Anbieter offen (A.10), Mailpit ist NUR dev.
   - DB-Adapter: **MariaDB** (der verifizierte Default unserer dev-Instanz seit
     dem 1.9.5-Umstieg — nicht MongoDB/Postgres experimentieren).
2. **Console-Bootstrap (manuell, interaktiv):** Account anlegen → Projekt
   (Project ID notieren) → **zwei API-Keys** exakt nach DEPLOYMENT.md §1:
   Runtime-Key (`sessions.write, users.read/write, rows.read/write, health.read`)
   und Migrations-Key (`databases/tables/columns/indexes` + `storage` für den
   Bucket + `projects.write` falls die Platform per API angelegt werden soll).
3. **Schema-Bootstrap (automatisiert, idempotent):** `pnpm bootstrap` existiert
   (`apps/comments/scripts/bootstrap.ts`) und legt DB, Avatars-Bucket,
   Web-Platform (best-effort) und ALLE Layer-Migrationen
   (system→comments→moderation→admin) in einem Lauf an — 409 → skip, Guard
   gegen destruktiven Re-Run. Für Prod läuft er **von der lokalen Maschine**
   gegen den Prod-Endpoint mit einer nicht committeten `.env.production`:
   `node --experimental-strip-types --env-file=apps/comments/.env.production
   apps/comments/scripts/bootstrap.ts`. **Kein `--seed` in Prod**
   (Demo-User/Demo-Kommentare sind dev-only). Achtung (OPEN-ITEMS, bekannt):
   die Layer-`migrate`-Scripts pinnen `--env-file` auf comments — für
   DIESE App korrekt, für App 2 vor deren Go-Live entkoppeln.
4. **Platforms/Domains:** `comments.example.com` als Web-Platform registrieren
   (CORS + Cookie); die Platform aus dem Bootstrap ist `localhost` und Prod
   braucht die echte Hostname-Platform zusätzlich (Console, 1 Minute).
5. **Bootstrap-Admin:** eigenem User in der Console das Label `admin` geben
   (Self-Lockout-Schutz greift danach).
6. **Email-Policies** (1.9.5, P3): Auth → Security → Wegwerf-Adressen blocken —
   der Betreiber-Toggle, App-UX (422→i18n) ist schon gebaut.

### A.4 Nuxt-Deployment via ploi.io (Server 1)

- **Site-Typ:** ploi-Site mit statischem nginx-vHost als **Reverse Proxy auf
  `127.0.0.1:3000`** (ploi: „NodeJS"-Site bzw. Web-Directory egal + nginx-
  Template auf proxy_pass umstellen; ploi hat dafür den eingebauten
  NodeJS/Proxy-Flow). WebSocket-Header (`Upgrade`/`Connection`) im vHost
  aktivieren — der Browser spricht Realtime zwar direkt mit `api.example.com`,
  aber SSE/zukünftige Endpoints der App sollen nicht kaputtkonfiguriert sein.
- **Prozess-Supervision: ploi-Daemon (= systemd)** statt PM2. Begründung: ein
  einzelner Nitro-Prozess braucht kein PM2-Cluster; systemd-Restart-Policy
  (`Restart=always`) deckt Crashes ab; eine Schicht weniger. Daemon-Kommando:
  `node /home/ploi/comments.example.com/apps/comments/.output/server/index.mjs`
  mit `PORT=3000`, `HOST=127.0.0.1`, `NODE_ENV=production`.
  (PM2 bleibt die Option, wenn später echtes Zero-Downtime-Reload gewünscht
  ist — s. Zero-Downtime unten.)
- **Node 22** auf dem Server (ploi Node-Version-Manager; `.nvmrc` liegt im Repo).
- **Deploy-Script (ploi):** exakt das dokumentierte aus CONCEPT A9 /
  DEPLOYMENT.md §3, plus Daemon-Restart:
  ```bash
  cd /home/ploi/comments.example.com
  git pull origin main
  npm i -g pnpm
  pnpm install --frozen-lockfile
  pnpm --filter comments build
  # Daemon-Restart (ploi-Platzhalter oder systemctl):
  {RESTART_DAEMON}   # bzw.: sudo systemctl restart ploi-daemon-<id>
  curl -fsS http://127.0.0.1:3000/api/health || exit 1
  ```
- **Zero-Downtime, ehrlich eingeordnet:** Nitro baut in `.output/` **in place**;
  der Daemon-Restart kostet ~1–2 s. Für den Start akzeptieren wir diese
  Mini-Lücke (nginx liefert in der Zeit 502 an einzelne Requests). Echtes
  Zero-Downtime = Stufe 2: Build in Release-Verzeichnis
  (`releases/<sha>` + `current`-Symlink, ploi kann „Zero downtime deployment"
  für solche Strukturen) ODER PM2 mit 2 Instanzen + `pm2 reload`. Entscheidung
  offen (A.10) — nicht Go-Live-blockierend.
- **Env-Vars:** als ploi „Environment"-Variablen der Site (landen in der
  Prozess-Umgebung des Daemons/Deploys), NIE im Repo — Liste exakt nach
  DEPLOYMENT.md §3 (`NUXT_APPWRITE_KEY` = Runtime-Key,
  `NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.example.com/v1`,
  `…PROJECT_ID`, `…DATABASE_ID`, `…AVATARS_BUCKET`,
  `NUXT_PUBLIC_APP_URL=https://comments.example.com`).
  **`NUXT_APPWRITE_MIGRATIONS_KEY` kommt NIE auf den App-Server.**
  `NUXT_PUBLIC_*` werden von Nitro zur **Laufzeit** aus der Env gelesen
  (runtimeConfig-Override) — der Build muss also nicht pro Env-Änderung neu
  laufen, aber Daemon-Restart ja.

### A.5 Deploy-Webhook aus GitHub Actions (deploy.yml fertig gedacht)

**✅ SCHARFGESCHALTET (2026-07-17):** deploy.yml läuft bereits auf main — workflow_run auf „Test", concurrency, permissions: {}; ohne das Secret ist der Webhook-Call ein no-op. Am Go-Live-Tag bleibt nur Block 8 (Secret setzen). Ursprünglicher Plan:

- **Trigger:** statt `on: push` direkt → **`workflow_run` auf den bestehenden
  „Test"-Workflow** (der auf `main`-Pushes läuft), Bedingung
  `github.event.workflow_run.conclusion == 'success'` + Branch `main`.
  Damit deployt nur, was Tests bestanden hat — lint/typecheck laufen parallel
  als eigene Workflows und bleiben Warnlampen. `workflow_dispatch` als
  manueller Hebel bleibt drin.
- **Job:** der bereits auskommentierte Einzeiler —
  `curl -fsS -X POST "${{ secrets.PLOI_DEPLOY_WEBHOOK_COMMENTS }}"` —
  plus `concurrency: deploy-comments` (kein Webhook-Doppelfeuer bei
  schnellen Push-Folgen) und `permissions: {}` (der Job braucht nicht mal
  `contents: read`).
- **Secret:** `PLOI_DEPLOY_WEBHOOK_COMMENTS` = die von ploi pro Site
  generierte Deploy-Webhook-URL (Repo-Settings → Secrets → Actions).
- **Bewusst NICHT:** Build in Actions + Artefakt-Push auf den Server. Der Build
  läuft auf dem Server (ploi-Deploy-Script) — einfacher, und die
  `NUXT_PUBLIC_*`-Frage ist eh runtime-gelöst. CI mit echter Appwrite-Instanz
  (OPEN-ITEMS Idee 8) ist ein späteres Upgrade dieses Flows.
- ploi-Alternative „Quick Deploy bei GitHub-Push" bleibt bewusst AUS —
  sonst deployt ungetesteter Code an den Actions vorbei.

### A.6 Backups

**Server 2 (Appwrite) — das eigentliche Asset:**

| Ebene | Was | Wie | Frequenz/Retention |
|---|---|---|---|
| 1 | **MariaDB-Dump** | Cron-Script: `docker compose exec -T mariadb sh -c 'exec mariadb-dump --all-databases -uroot -p"$MYSQL_ROOT_PASSWORD"' | gzip > /backup/db-$(date +%F-%H%M).sql.gz` | täglich, 14 Tage lokal |
| 2 | **Storage-Volumes** | `appwrite-uploads` (+ `appwrite-config`/Zertifikate, `appwrite-functions`) als tar aus `/var/lib/docker/volumes/…` bzw. via `docker run --volumes-from` | täglich, 14 Tage |
| 3 | **Offsite** | rsync/rclone der `/backup`-Verzeichnisse auf eine **Hetzner Storage Box** (BX11, ~4 €/Monat) oder S3-kompatiblen Bucket | täglich nach 1+2 |
| 4 | **Hetzner Server-Backups** | Häkchen in der Cloud-Console (20 % Aufpreis, 7 rotierende Slots) — Ganz-Server-Snapshot als Disaster-Fallback, ersetzt NICHT 1–3 (kein konsistenter DB-Zustand garantiert) | automatisch |

Redis ist reiner Cache → kein Backup. **Restore-Probe ist Teil des Go-Live**
(Teil B): Dump in eine Wegwerf-Instanz einspielen, sonst ist es kein Backup,
sondern Hoffnung. Vor jedem Appwrite-Versions-Upgrade zusätzlich manuelles
Backup (etablierte Prozedur, APPWRITE-1.9.5-UPGRADE.md §Risiken).

**Server 1 (App):** zustandslos — Repo + ploi-Env-Vars sind die Quelle der
Wahrheit. Einmalig die Env-Var-Werte in den Passwort-Manager sichern;
Hetzner-Backups optional.

### A.7 Monitoring & Healthchecks

- **`GET /api/health` existiert** (`packages/core/server/api/health.get.ts`):
  prüft via Admin-Client (`health.get()`, Scope `health.read`) die
  Appwrite-Instanz durch und liefert `{ ok: true }` — EIN externer Check auf
  `https://comments.example.com/api/health` überwacht damit transitiv beide
  Server (App up, Appwrite up, Key gültig, Netzpfad ok).
- **Extern (Alarmierung):** UptimeRobot/Better Stack Free-Tier — Check 1:
  `/api/health` (Keyword `"ok":true`), Check 2: `https://api.example.com/`
  (TLS/Erreichbarkeit Appwrite direkt, fängt den Fall „App-Cache verdeckt
  Appwrite-Ausfall"). Alert an E-Mail/Push.
- **ploi-Monitoring (Server 1):** CPU/RAM/Disk-Schwellwerte + Benachrichtigung;
  ploi überwacht auch den Daemon (systemd restartet ohnehin).
- **Server 2:** `docker compose ps`-Disziplin reicht nicht — der
  Realtime-Watchdog (A.9) übernimmt den kritischen Container; zusätzlich
  Disk-Alarm (MariaDB + Uploads wachsen) via ploi (Server 2 kann als
  „server only" ohne Sites in ploi hängen) oder simplem Cron+Mail.
- **Appwrite-eigene Health-Endpoints** (`/v1/health/*`, Key-pflichtig) sind die
  Diagnose-Ebene bei Incidents, nicht das Dauer-Monitoring.
- **Später (OPEN-ITEMS Idee 5, „fast Pflicht"):** `maui.observability`-Gate
  (Sentry/strukturierte Logs am zentralen error.ts) — bewusst NACH dem
  Go-Live als eigener Schritt.

### A.8 Security-Hardening

**Beide Server:**
- SSH: nur Key-Auth (`PasswordAuthentication no`), Root-Login aus, eigener
  User + sudo; ploi erledigt das bei der Provisionierung von Server 1.
- **Hetzner Cloud Firewall** (vor der VM, kostenlos): eingehend nur 22
  (idealerweise IP-beschränkt auf eigene IP/ploi), 80, 443. Alles andere zu —
  insbesondere dürfen MariaDB (3306) und Redis (6379) von Server 2 NIE
  öffentlich sein (Compose exponiert sie standardmäßig nicht — Firewall ist
  der Backstop, falls je ein Port-Mapping dazukommt).
- fail2ban (ploi installiert es auf Server 1; auf Server 2 manuell) +
  unattended-upgrades für OS-Patches.

**Appwrite (Server 2):**
- Console-Zugang: `_APP_CONSOLE_WHITELIST_ROOT=enabled` +
  `_APP_CONSOLE_WHITELIST_EMAILS` (nur David) — die Console liegt öffentlich
  unter `api.example.com/console`, Registrierung ist damit dicht. Optional
  Stufe 2: `/console` im Traefik/per Middleware auf Allowlist-IP beschränken.
- `_APP_OPTIONS_ABUSE=enabled` (Appwrite-Rate-Limits) — zusätzlich hat die App
  ihre eigene rate-limit-Middleware auf Auth-/Schreib-Endpoints (bereits
  gebaut, Security-Review 2026-06-29).
- Key-Hygiene: Runtime-Key NUR in ploi-Env (Server 1), Migrations-Key NUR
  lokal für Bootstrap/Migrationsläufe (DEPLOYMENT.md §2) — nie auf Servern.
- SMTP-Credentials nur in der Appwrite-`.env` (Instanz), nicht im Repo.

**App (Server 1):**
- Browser-Bundle-Check nach erstem Deploy: kein `NUXT_APPWRITE_KEY` im
  Client-Bundle (DEPLOYMENT.md §5).
- nginx: HSTS aktivieren (ploi-Toggle), HTTP→HTTPS-Redirect (Default).
- **Trusted Proxy / X-Forwarded-For (Audit 2026-07-05, entschieden):**
  authAudit und die rate-limit-Middleware vertrauen dem ERSTEN
  X-Forwarded-For-Eintrag — das ist nur hinter einem vertrauenswürdigen
  Proxy korrekt. Die App läuft deshalb ausschließlich hinter dem ploi-nginx
  (setzt XFF selbst); der Nitro-Port 3000 darf NIE direkt exponiert sein —
  die Hetzner-Firewall (nur 22/80/443, s. o.) erzwingt genau das.
  Bewusst KEIN zusätzliches Code-Gate — die Setup-Garantie reicht;
  Checkpunkt: `curl -H 'X-Forwarded-For: 1.2.3.4' http://<server-ip>:3000`
  muss von außen ins Leere laufen (Firewall), nicht antworten.

**Bekannte, bewusst getragene Restrisiken** — aktualisiert 2026-07-05 (Audit):
Die früher hier gelisteten Punkte (`comment_votes`-Table-Read,
hidden-REST-Leak, unvollständige GDPR-Löschung) sind seit 2026-07-02 GELÖST
(Migrationen comments-007/008, UserDataContributor-Vertrag). Verbleibend:
Presence-Metadata ist für alle eingeloggten User lesbar (bewusst entschieden,
OPEN-ITEMS 2026-07-05) und das Rate-Limit ist in-memory (Multi-Instanz
bräuchte Redis — es ist eine Instanz geplant). Keins davon blockiert den
Go-Live.

### A.9 Realtime-Betrieb (Swoole-Crash-Watchdog)

Bekanntes Verhalten (2026-07-01 live erlebt, OPEN-ITEMS + CLAUDE.md): der
`appwrite-realtime`-Container kann nach einem Swoole-Crash **degradiert
weiterlaufen** — Docker-Status „running", aber er liefert keine Events mehr.
`restart: unless-stopped` greift dann NICHT (der Prozess lebt ja). Fix war
verifiziert: `docker compose up -d --no-deps appwrite-realtime` (Container neu
ERSTELLEN, nicht nur restarten).

**Plan (zweistufig):**
1. **Watchdog-Cron auf Server 2** (alle 2–5 min): Script versucht einen echten
   WebSocket-Handshake gegen
   `wss://api.example.com/v1/realtime?project=<id>&channels[]=files` (bzw.
   intern `http://localhost/v1/realtime…` mit Upgrade-Headern; Erfolg = HTTP 101
   innerhalb Timeout). Bei Fehlschlag: `docker compose up -d --no-deps
   appwrite-realtime` + Logzeile + Mail/Webhook-Alert. Ein reiner
   `docker inspect`-Healthcheck reicht NICHT, weil der degradierte Zustand
   HTTP-seitig gesund aussehen kann — der Handshake ist der Beweis.
2. **App-seitiger Backstop existiert schon:** Presence-Poll (20 s) und
   Realtime-Backoff/Reconnect in `useRealtimeClient`/`useRealtimeRows` — bei
   totem Worker degradiert die UX (kein Live), bricht aber nicht.

Zusätzlich in die Betriebs-Doku: nach jedem Appwrite-Upgrade/`docker compose
up` den Realtime-Pfad rauchtesten (zweiter Browser sieht Kommentar live —
DEPLOYMENT.md §5 hat den Schritt schon).

### A.10 Entscheidungen — ✅ ALLE GEFALLEN (2026-07-17, David)

| # | Entscheidung | ✅ Beschluss |
|---|---|---|
| 1 | **Root-Domain** | **`pukalani.app`** (vorhanden, Cloudflare-Registrar → DNS bei Cloudflare, api-Record „DNS only") |
| 2 | **SMTP-Anbieter** | **Resend** (EU-Region wählen, Absender-Domain pukalani.app verifizieren) |
| 3 | **Zero-Downtime Stufe 2** | **1–2 s Restart akzeptieren**; releases-Struktur später nachrüstbar |
| 4 | **Offsite-Backup-Ziel** | **Hetzner Storage Box BX11** (rsync, gleiche Rechnung) |
| 5 | **Monitoring-Dienst** | **UptimeRobot free** + ploi-Server-Monitoring |
| 6 | **`/console`-IP-Restriktion** | **Whitelist reicht** (`_APP_CONSOLE_WHITELIST_EMAILS=mail@davidschubert.com`); IP-Allowlist = Stufe 2 bei Bedarf |
| 7 | **Appwrite Function `changelog-draft`** | **Follow-up Woche 2** nach Go-Live |
| 8 | **Observability-Gate** | **Direkt nach Go-Live** (Woche 1: Sentry am maui.observability-Gate andocken) |
| 9 | **CI-Gate-Umfang** | **Nur „Test" grün gated den Deploy**; Typecheck/Lint bleiben Warnlampen |
| 10 | **www/Root-Redirect** | **Vorerst Redirect auf die App**, Plattform-Landingpage später |

Alerts (UptimeRobot, Watchdog, Health-Sweep): **mail@davidschubert.com**.
Projektweite Beschlüsse vom selben Datum: Klasse-B-Realtime → vor G3
**Appwrite-Upgrade prüfen** (liest eine neuere Version den jwt-Query-Param
am Realtime-Endpoint?); Community-Site → **später entscheiden** (M5 gilt mit
photos + portfolio als komplett); **M8-Stripe nach PHASE-17**; Journal/Blog
und pages (Standardseiten) werden **eigene Feature-Layer** (nicht Teil der
portfolio-Site — die bleibt Landing + Cases).

---

## TEIL B — Betreiber-Checkliste (David)

> **GENERALPROBE ✅ (lokal, 2026-07-17):** Der Deploy-Pfad ist vorab
> durchgespielt — `pnpm --filter comments build` läuft sauber (26 MB
> .output; photos/studio/portfolio bauen ebenfalls), der Nitro-Prod-Boot
> exakt wie der ploi-Daemon (`PORT=3000 HOST=127.0.0.1 node
> .output/server/index.mjs`) liefert /api/health ok + Seite + Login gegen
> die lokale Instanz. **Restore-Probe bestanden:** ops/appwrite-backup.sh-
> Dump in eine Wegwerf-MariaDB (mariadb:11) importiert → 855 Tabellen,
> 11 Projekte plausibel. Am Go-Live-Tag bleiben damit nur noch die
> Infrastruktur-Schritte (Konten, Server, DNS, Envs) — jeder Code-Pfad
> der Checkliste ist bereits einmal grün gelaufen.

Legende: 💶 = kostet Geld · ⏳ = DNS-/Wartezeit · ✅-Zeilen = Verifikation.
Reihenfolge einhalten — jeder Block baut auf dem vorherigen auf.

### Block 0 — Entscheidungen & Konten (Vorabend)

- [ ] Root-Domain festlegen (A.10 #1); falls neu: Domain registrieren 💶 (~10–20 €/Jahr)
- [ ] SMTP-Anbieter wählen (A.10 #2), Account anlegen, Absender-Domain
      verifizieren (SPF/DKIM-Records notieren — kommen in Block 2 mit ins DNS) 💶 (Free-Tier reicht oft)
- [ ] ploi.io-Account bereit (Plan mit 2 Servern) 💶 (~8–10 €/Monat)
- [ ] Hetzner-Cloud-Account bereit, SSH-Key hinterlegt
- [ ] Passwort-Manager-Eintrag „maui-prod" anlegen (sammelt gleich: Keys, IDs, Webhook-URL)

### Block 1 — Server bestellen 💶

- [ ] Hetzner Cloud: **CX32** bestellen (Ubuntu 24.04, Standort FSN/NBG, SSH-Key) → „appwrite-prod", IP notieren 💶 (~7 €/Monat)
- [ ] Hetzner Cloud: **CX22** bestellen (Ubuntu 24.04, gleicher Standort, SSH-Key) → „app-prod", IP notieren 💶 (~4 €/Monat)
- [ ] Hetzner Cloud Firewall „web-basic" anlegen: Inbound 22/80/443, sonst zu; beiden Servern zuweisen
- [ ] Hetzner Server-Backups für „appwrite-prod" aktivieren 💶 (20 % Aufpreis, ~1,40 €/Monat)
- [ ] ✅ `ssh root@<ip-app>` und `ssh root@<ip-appwrite>` funktionieren per Key

### Block 2 — DNS ⏳

- [ ] TTL der Zone auf 300 s senken (falls möglich)
- [ ] A-Record `comments.example.com` → IP „app-prod"
- [ ] A-Record `api.example.com` → IP „appwrite-prod"
- [ ] SPF/DKIM/DMARC-Records des SMTP-Anbieters eintragen (aus Block 0)
- [ ] ⏳ Propagation abwarten (Minuten bis Stunden)
- [ ] ✅ `dig +short comments.example.com` und `dig +short api.example.com` liefern die richtigen IPs

### Block 3 — Server 1 an ploi hängen

- [ ] ploi: „Create Server" → „Custom/Hetzner" → IP von „app-prod" + Root-Zugang → Provisionierung durchlaufen lassen (~10 min)
- [ ] ploi: Node.js **22** auf dem Server installieren/aktivieren
- [ ] ploi: fail2ban/ufw-Status prüfen (Standard bei Provisionierung), SSH-Passwort-Login ist aus
- [ ] ✅ Server erscheint „grün" in ploi, `ssh ploi@<ip-app>` funktioniert

### Block 4 — Appwrite-Prod installieren (Server 2)

**✅ ERLEDIGT bis auf Davids Console-Schritte (2026-07-18, via SSH ploi@188.245.61.155):**
Installer 1.9.5 non-interaktiv (`--interactive=N --no-start=true --database=mariadb`,
Flags aus dem Image-Source — gepiptes stdin startet sonst einen Web-Installer!).
`.env` VOR dem Erststart gehärtet: alle Default-Secrets ersetzt (OpenSSL-Key,
DB-Passwörter, Executor-Secret — Werte in `~/.appwrite-secrets`, chmod 600,
→ Passwort-Manager!), Domains auf api.pukalani.app, Force-HTTPS, Abuse,
Console-Whitelist (mail@davidschubert.com), Resend-SMTP (Key = Platzhalter
`RESEND_KEY_HIER_EINSETZEN` — David ersetzt ihn selbst, nie durch den Chat).
Stolperfalle: LE-Zertifikat braucht **`_APP_EMAIL_CERTIFICATES`** (eigene Var,
nicht nur SYSTEM_SECURITY_EMAIL) + manuellen Anstoß
`docker compose exec appwrite ssl domain="api.pukalani.app"`. Verifiziert von
außen: `/v1/health/version` → 1.9.5, gültiges LE-Zert, HTTP-GET→301 (HEAD
gibt 500 — Appwrite-Eigenheit, harmlos), Console erreichbar. Die
Dateien in `~/appwrite` gehören `ploi` (docker-chown-Trick — ploi hat kein
passwortloses sudo, aber docker-Gruppe).

- [ ] Auf „appwrite-prod": Docker + Compose-Plugin installieren (`curl -fsSL https://get.docker.com | sh`)
- [ ] Appwrite **1.9.5** installieren (Installer nach APPWRITE-1.9.5-UPGRADE.md-Muster, Tag `1.9.5` pinnen), HTTP 80 / HTTPS 443
- [ ] Appwrite-`.env` setzen: `_APP_ENV=production`, `_APP_DOMAIN=api.example.com`, `_APP_DOMAIN_TARGET=api.example.com`, `_APP_OPTIONS_FORCE_HTTPS=enabled`, `_APP_CONSOLE_WHITELIST_ROOT=enabled`, `_APP_CONSOLE_WHITELIST_EMAILS=mail@davidschubert.com`, `_APP_OPTIONS_ABUSE=enabled`, SMTP-Werte aus Block 0 → `docker compose up -d`
- [ ] ⏳ Traefik holt das Let's-Encrypt-Zertifikat (Minuten; braucht das DNS aus Block 2)
- [ ] ✅ `curl -sI https://api.example.com/` liefert eine Antwort mit gültigem TLS (kein Zertifikatsfehler)
- [ ] Console öffnen (`https://api.example.com/console`) → Account registrieren (whitelisted E-Mail) → Projekt anlegen → **Project ID notieren**
- [ ] Zwei API-Keys anlegen (DEPLOYMENT.md §1): `nuxt-ssr-prod` (Runtime) + `migrations-prod` → in den Passwort-Manager
- [ ] ✅ Console-Logout → Neu-Registrierung mit fremder Mail wird abgelehnt (Whitelist greift)

### Block 5 — Schema-Bootstrap (von der lokalen Maschine)

**✅ KOMPLETT (2026-07-19):** Bootstrap gegen api.pukalani.app gelaufen —
29 Tables (alle Pflicht-Tables vorhanden), Buckets, alle Layer-Migrationen
system→comments→…→admin. **Drei Prod-Learnings:**
1. Der **Migrations-Key braucht auch `rows.read/write`** — Migrationen
   seeden Default-Rows (system-002 app_config) und machen Row-Backfills
   (comments-005/006). In Dev nie aufgefallen (Vollzugriffs-Key).
2. Der bekannte Budget-vor-409-Effekt schlägt beim RE-Run des kompletten
   system-Layers zu (system-011 wirft column_limit_exceeded für die längst
   existierende Spalte). Workaround: nach einem Teil-Fehlschlag die
   restlichen Layer einzeln mit `--layer` weiterfahren statt von vorn.
3. `migrate.mjs` ohne `--env-file` fällt auf die Dev-.env zurück — bei
   Prod-Läufen IMMER `--env-file apps/<app>/.env.production` mitgeben.

**Vorarbeit ✅ (2026-07-18):** Projekt `comments` + beide Keys von David
angelegt; Claude hat per Console (Davids Browser-Session) beide Keys auf
least-privilege eingeengt (je 10 Scopes — Runtime: users.r/w, sessions.write,
rows.r/w, files.r/w, health.read, presences.r/w; Migrations: databases/
tables/columns/indexes/buckets je r/w — buckets wegen Bootstrap-Bucket-
Anlage, files/presences als dokumentierte Ergänzung zu DEPLOYMENT.md §1),
Web-Platform `comments.pukalani.app` (Typ Nuxt) angelegt,
`apps/comments/.env.production` mit allen Nicht-Secrets vorbereitet.
**Known-Limitation:** „Deny disposable emails" (Auth → Security) lässt sich
auf 1.9.5 self-hosted NICHT speichern — die gebundelte Console ist dem
Server-API voraus (PATCH-Endpoint fehlt, Update verpufft nach Reload).
Beim nächsten Appwrite-Upgrade erneut versuchen; bis dahin ohne.

- [ ] `cp apps/comments/.env.example apps/comments/.env.production` und füllen: Endpoint `https://api.example.com/v1`, Project-ID, `NUXT_PUBLIC_APPWRITE_DATABASE_ID=main`, `NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars`, `NUXT_APPWRITE_KEY=<migrations-prod>` (Bootstrap braucht die Schema-Scopes) — Datei ist durch `.gitignore` (`.env*`) gedeckt, trotzdem: NIE committen
- [ ] `nvm use 22` und Bootstrap laufen lassen: `node --experimental-strip-types --env-file=apps/comments/.env.production apps/comments/scripts/bootstrap.ts` (OHNE `--seed`!)
- [ ] ✅ Ausgabe: Datenbank ✔/↷, Bucket ✔/↷, alle Migrationen system→comments→moderation→admin grün
- [ ] Console → Projekt → Platforms: Web-Platform mit Hostname `comments.example.com` hinzufügen
- [ ] Console → Auth → Security: Wegwerf-E-Mail-Blocking aktivieren (P3-Betreiber-Toggle)
- [ ] ✅ Console → TablesDB: Tables `audit_logs, app_config, notifications, comments, comment_votes, reports, changelog` existieren

### Block 6 — ploi-Site für die App

**✅ ANGELEGT (2026-07-18, ploi-Panel per Browser):** Site 389772
`comments.pukalani.app` auf app-prod (118713), Typ NodeJS — ploi hat **Port
3001** vergeben (statt geplanter 3000; überall übernommen). Repo
`davidschubert/maui-monorepo@main` verbunden (Quick Deploy AUS — Achtung:
der Branch-Loader wählt den ERSTEN Branch vor, dependabot/* — auf main
korrigieren!). Bewusste Abweichung von A.4: **pm2 statt systemd-Daemon** —
ploi's NodeJS-Site-Typ bietet nur PM2/Supervisor, dafür restartet ploi den
Prozess nach jedem Deploy automatisch (Setting „Restart process after
deployment") und der Deploy braucht kein sudo. Start-Kommando `bash
start-prod.sh` (Wrapper sourct die Site-`.env` → Nitro liest zur Laufzeit
keine .env; Secrets so NICHT in der pm2-Cmdline). `.env`-Skeleton liegt
(chmod 600, Platzhalter für PROJECT_ID/Runtime-Key/Resend). Deploy-Script
nutzt **corepack pnpm** (kein global-Install nötig; COREPACK_ENABLE_DOWNLOAD_
PROMPT=0). Server hat Node **24** (nodesource, ploi-Default) — engines
`>=22` erfüllt, Abweichung vom getesteten 22 beobachten. LE-Zertifikat
ausgestellt (Stolperfalle: `public/`-Webroot musste erst per mkdir angelegt
werden — Monorepo hat keins). **Deploy-Learnings:** (1) Erster Build starb
mit OOM — Nodes Default-Heap-Cap ~1,9 GB, nicht der Server (3,7 GB RAM +
4,7 GB Swap vorhanden) → `export NODE_OPTIONS=--max-old-space-size=4096` im
Deploy-Script, Build #2 grün. (2) ploi schreibt für NodeJS-Sites KEINEN
Proxy-vHost — nginx blieb auf statischem /public (403/404) → vHost im
Panel-Editor auf `proxy_pass http://127.0.0.1:3001` + WebSocket-Header
(`Connection $http_connection` — kein connection_upgrade-Map auf dem Server)
umgeschrieben, Test ok, Reload ok. (3) pm2-Reboot-Festigkeit ohne sudo:
`pm2 save` + `@reboot pm2 resurrect` im ploi-User-Crontab (das
sudo-pflichtige `pm2 startup` entfällt). **Verifiziert von außen:**
Startseite 200 (42 KB SSR-HTML) über TLS; `/api/health` erreicht Nitro —
antwortet bis zum Eintragen von Project-ID/Runtime-Key erwartungsgemäß mit
INTERNAL_ERROR (Platzhalter-Env).

- [ ] ploi → Server „app-prod" → „Create Site": Domain `comments.example.com`, Projekt-Typ NodeJS/Proxy auf Port **3000**
- [ ] Repository verbinden: GitHub-Repo, Branch `main` (ploi „Quick Deploy" AUS lassen — Deploy kommt aus Actions, Block 8)
- [ ] Deploy-Script setzen (A.4): `git pull` → `npm i -g pnpm` → `pnpm install --frozen-lockfile` → `pnpm --filter comments build` → Daemon-Restart → Health-Curl
- [ ] Environment-Variablen der Site setzen (DEPLOYMENT.md §3): `NUXT_APPWRITE_KEY=<nuxt-ssr-prod>`, `NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.example.com/v1`, `NUXT_PUBLIC_APPWRITE_PROJECT_ID=…`, `NUXT_PUBLIC_APPWRITE_DATABASE_ID=main`, `NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=avatars`, `NUXT_PUBLIC_APP_URL=https://comments.example.com` — **KEIN Migrations-Key!**
- [ ] Daemon anlegen: `node .../apps/comments/.output/server/index.mjs`, Env `PORT=3000 HOST=127.0.0.1 NODE_ENV=production`, User `ploi`
- [ ] Let's-Encrypt-Zertifikat für die Site ausstellen (ploi-Button) ⏳ (Sekunden bis Minuten)
- [ ] Ersten Deploy manuell in ploi auslösen („Deploy now")
- [ ] ✅ `curl -s https://comments.example.com/api/health` → `{"ok":true,…}`
- [ ] ✅ Seite lädt im Browser, HTTPS-Schloss ok, HSTS-Header gesetzt (ploi-Toggle)

### Block 7 — Funktions-Smoke-Test (DEPLOYMENT.md §5)

**✅ KOMPLETT (2026-07-19):** Registrierung + Login (David), `admin`-Label
per Console-API gesetzt (PUT /users/:id/labels — der UI-Chip-Klick
persistierte nicht), Kommentar erstellt. **Gast-Beweis:** curl ohne Cookies
sieht die Kommentare (Row-read(any)). **Realtime-Beweis:** Beobachter-Tab
minutenlang offen → zweiter Kommentar lief OHNE Reload live ein, Presence
„1 gerade online". Bundle-Leak-Check automatisiert: kein NUXT_APPWRITE_KEY
in HTML/JS-Assets. /changelog 200. **Klarstellung zum Checklisten-Punkt
„Verifizierungs-Mail":** die App verschickt bei der Registrierung bewusst
KEINE Verification-Mail (Passwort-Signup by design) — der SMTP-Beweis läuft
über die **OTP-Login-Mail** (kam an, Resend-Kette bewiesen). UptimeRobot-
Monitor 2 (Keyword `"ok":true`) wieder aktiviert, Health liefert `ok:true`.

- [ ] Registrieren + E-Mail-Verifizierung kommt an (SMTP-Beweis) → Login
- [ ] ✅ DevTools: Cookie `a_session_<PROJECT_ID>` mit Domain `.example.com`, httpOnly+secure
- [ ] Eigenem User in der Appwrite-Console das Label `admin` geben → Dashboard erreichbar
- [ ] Kommentar erstellen / voten / antworten
- [ ] ✅ **Realtime:** zweiter Browser (Gast-Tab) sieht den neuen Kommentar live — beweist Same-Root-Domain-Cookie + JWT-Socket + gesunden realtime-Container
- [ ] Melden → Moderations-Queue; Reply-Notification-Link stimmt; `/changelog` rendert
- [ ] ✅ DevTools → Sources: Suche nach `NUXT_APPWRITE_KEY` im Bundle → 0 Treffer

### Block 8 — GitHub Actions Deploy-Webhook

**✅ SECRET GESETZT (2026-07-18):** Webhook-URL per ploi-„Copy" →
macOS-Zwischenablage → `pbpaste | gh secret set PLOI_DEPLOY_WEBHOOK_COMMENTS`
(Wert nie im Chat/Transkript; Clipboard danach geleert). Zusätzlich ploi
Health-check-URL der Site auf `https://comments.pukalani.app/api/health`
gesetzt (Mail bei Nicht-200 nach Deploy). Deploy #2 der Site war bereits
Successful (195 s, inkl. NODE_OPTIONS-Fix). Der Push DIESES Commits ist der
e2e-Beweis: Test → Deploy-Workflow → ploi-Deploy #3.
**✅ KETTE BEWIESEN (2026-07-18):** Push `fb57f02` → Test grün →
Deploy-Workflow grün → ploi zog den Commit, baute (Artefakt 18:26 UTC) und
restartete pm2 (neue PID, restarts=1) — „Restart process after deployment"
funktioniert. Site danach extern 200.

**✅ BLOCK 9 KOMPLETT (2026-07-18):** Storage Box provisioniert, echter
Benutzername `u634923` (NICHT die Box-ID — steht in der Console-Spalte
„Benutzername"). rsync über SSH Port 23, Key-Auth verifiziert (Box-Shell ist
restricted — kein echo; und Vorsicht: inneres `ssh` in Remote-Scripts braucht
`-n`, sonst frisst es das stdin-Script). OFFSITE_TARGET=
`storagebox:backups/appwrite` am Cron; Beweis: 2 komplette Backup-Sätze
(Dump + 3 Volume-Tars) liegen offsite.

- [ ] ploi → Site → Deploy-Webhook-URL kopieren
- [ ] GitHub → Repo → Settings → Secrets and variables → Actions → Secret `PLOI_DEPLOY_WEBHOOK_COMMENTS` = Webhook-URL
- [x] `deploy.yml` scharfgeschaltet (2026-07-17, vorab) — ohne Secret no-op; hier nur noch das Secret setzen
- [ ] ✅ Trivialen Commit auf `main` pushen → Actions: Test grün → Deploy-Workflow feuert → ploi zeigt neuen Deploy → `/api/health` weiter `ok:true`

### Block 9 — Backups (Server 2)

**✅ INSTALLIERT bis auf Storage Box (2026-07-18):** Scripts unter
`/home/ploi/ops/` (nicht /opt — ploi-User ohne passwortloses sudo), Crons im
ploi-User-Crontab: Watchdog */5, Backup 03:30 → Logs in `~/ops/logs/`,
BACKUP_DIR=/home/ploi/backup. Beweis-Läufe grün: Watchdog Handshake 101;
Backup Dump + 3 Volume-Tars. Offen: Storage Box bestellen + OFFSITE_TARGET
an den Cron hängen.

- [ ] Backup-Script aus dem Repo kopieren: `ops/appwrite-backup.sh` → `/opt/ops/` (✅ lokal gegen die dev-Instanz getestet: Dump 1053 Tabellen + korrekte Projekt-Volumes; Env: APPWRITE_COMPOSE_DIR, BACKUP_DIR, OFFSITE_TARGET)
- [ ] Cron: täglich 03:30 Uhr, Ausgabe in Logfile
- [ ] Hetzner **Storage Box BX11** bestellen 💶 (~4 €/Monat), SSH-Key hinterlegen
- [ ] Offsite-Sync ans Backup-Script anhängen (rsync auf die Storage Box)
- [ ] ✅ Script einmal manuell laufen lassen: Dump + Tars in `/backup` UND auf der Storage Box vorhanden
- [ ] ✅ **Restore-Probe:** Dump in eine lokale Wegwerf-MariaDB einspielen (`docker run mariadb` + Import) → Tabellen vorhanden, Row-Counts plausibel

### Block 10 — Monitoring & Watchdog

**UptimeRobot ✅ (2026-07-18, per Browser in Davids Account):** Monitor 1
`https://api.pukalani.app/v1/health/version` (HTTP, 5 min) — aktiv und grün.
Monitor 2 `https://comments.pukalani.app/api/health` (Keyword-Monitor,
Incident wenn `"ok":true` FEHLT, 5 min) — angelegt aber PAUSIERT, bis die
Appwrite-Keys eingesetzt sind und der Smoke-Test grün ist (sonst
Dauer-Alarm). E-Mail-Alerts an mail@davidschubert.com, Test-Mail verschickt.
Öffentliche Status-Page bewusst DEAKTIVIERT (kann später aktiviert werden).

**Storage Box ✅ bestellt (2026-07-18):** `maui-backup` BX11 (1 TB,
3,81 €/Monat, Falkenstein, #617130) über die Hetzner Console. SSH-Support
aktiviert, SSH-Key des ploi-Users von appwrite-prod hinterlegt
(`ploi-appwrite-prod-backup`); Passwort NICHT gesetzt (SSH-Key-Auth; bei
Bedarf jederzeit „Passwort zurücksetzen" in der Console). ~/.ssh/config auf
appwrite-prod: Host `storagebox` → u617130.your-storagebox.de:23. Externe
Erreichbarkeit AUS (Hetzner-intern reicht). OFFSITE_TARGET kommt an den
Cron, sobald die Box provisioniert ist + rsync-Probe grün.

- [ ] UptimeRobot (o.ä.): Monitor 1 `https://comments.example.com/api/health` (Keyword `"ok":true`), Monitor 2 `https://api.example.com/` — Alerts an eigene E-Mail
- [ ] ploi-Monitoring für beide Server aktivieren (Server 2 als „server only" verbinden): CPU/RAM/**Disk**-Schwellwerte + Notification
- [ ] Realtime-Watchdog aus dem Repo kopieren: `ops/realtime-watchdog.sh` → `/opt/ops/` + Cron alle 5 min (✅ lokal getestet: Stopp-Probe → Container neu erstellt → 101-Handshake; optional ALERT_WEBHOOK)
- [ ] ✅ Watchdog-Probe: `docker compose stop appwrite-realtime` → binnen 5 min läuft der Container wieder + Alert kam an → Live-Kommentar-Test erneut grün
- [ ] ✅ Ausfall-Probe: Daemon auf Server 1 stoppen → UptimeRobot alarmiert → Daemon startet (systemd) automatisch neu

### Block 11 — Abschluss

- [ ] Alle Werte (IPs, IDs, Keys, Webhook, Storage-Box) final im Passwort-Manager
- [ ] `docs/DEPLOYMENT.md` um die realen Werte-Platzhalter/Erkenntnisse ergänzen; OPEN-ITEMS: Phase 17 als ✅ mit Datum; README-Status-Tabelle aktualisieren + committen + pushen
- [ ] Follow-ups terminieren (A.10): `changelog-draft`-Function deployen (Track 2B, braucht die jetzt vorhandene öffentliche Domain), Zero-Downtime Stufe 2. (Zwei früher gelistete Punkte waren veraltet: `comment_votes`-Table-Read seit 2026-07-02 gelöst (comments-007/008, s. A.8); Observability-Gate ist in apps/comments/app/app.config.ts längst aktiv — enabled + clientErrors.)

**Laufende Kosten (Zielbild):** CX32 ~7 € + CX22 ~4 € + Backups ~1,40 € +
Storage Box ~4 € + ploi ~8–10 € + Domain anteilig ≈ **25–28 €/Monat**.
