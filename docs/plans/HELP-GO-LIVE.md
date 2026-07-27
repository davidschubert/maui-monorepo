# Go-Live: help.pukalani.app (öffentliche Hilfe-Site)

Host **bestätigt** (David, `docs/DECISION-LOG.md` Eintrag 14 vom 2026-07-28),
Prod-Port **3006**.

Der **Repo-Teil ist fertig und committet**. Offen ist nur, was außerhalb des
Repos liegt: die ploi-Site, der nginx-Vhost, die Server-`.env` und das
Release-Verzeichnis. Dieses Dokument ist die Schritt-für-Schritt-Anleitung
dafür — sie ist bewusst so geschrieben, dass sie von oben nach unten abgehakt
werden kann.

## Was im Repo schon steht

| Datei | Inhalt |
| --- | --- |
| `ops/ecosystem-help.config.cjs` | pm2-Cluster `helppukalaniapp`, Port **3006**, `cwd: CURRENT`, `.env` aus `/home/ploi/help.pukalani.app/.env` |
| `.github/workflows/deploy.yml` | `help` in **beiden** Schleifen (Build + Ausliefern), `SITE[help]=help.pukalani.app`, `SLOT[help]=help` |
| `apps/help/server/api/health.ts` | eigener Health **ohne Appwrite** (Muster `apps/marketing`) — sonst 500, weil die .env leere Appwrite-Werte trägt |
| `apps/help/.env.example` | Vorlage für die Server-.env (Werte unten konkret) |
| `scripts/ops/verify-tls.mjs` | `help.pukalani.app` im TLS-Wächter |
| `docs/content/2.architektur/6.hosts-und-ports.md` | Prod-Zeile + Port-Tabelle + Stand |

## Warum diese Site kein Repository bekommt

Wie bei `control` (s. `CONTROL-CUTOVER.md`): die CI baut auf dem
Actions-Runner und rsyncht sowohl `.output` als auch `ops/`. Ein voller
Monorepo-Checkout auf dem Server nur für zwei Config-Dateien ist den
Plattenplatz und die Drift nicht wert.

**Konsequenz, bewusst akzeptiert:** es gibt für help **keinen
ploi-Fallback-Deploy** (der Panel-„Deploy"-Knopf hätte nichts zu tun). Der
Fallback ist dieses Runbook plus ein manueller rsync/pm2-Lauf.

## Voraussetzungen

- ploi-API-Token: `~/.maui-secrets/ploi-api.token` — Server `app-prod` =
  **118713**. Die nginx-Config **per API** setzen, nicht im Panel-Editor: der
  Monaco-Editor lässt sich nicht zuverlässig automatisiert befüllen
  (Learning 2026-07-23, `docs/DEPLOYMENT.md` §3).
- ssh auf `ploi@49.13.211.173` (derselbe Zugang wie beim Deploy).
- Kein Cloudflare-Token nötig — **es gibt keine Zertifikats-Aktion** (Schritt 5).

---

## Schritt 1 — ploi-Site anlegen

ploi → Server `app-prod` → **Create Site**:

| Feld | Wert |
| --- | --- |
| Domain | `help.pukalani.app` |
| Projekt-Typ | NodeJS |
| Web-Verzeichnis | ploi-Default (`/public`, wird durch den Proxy-Vhost ohnehin irrelevant) |
| Repository | **KEINS** — „Install repository" nicht anklicken |
| Quick Deploy | **AUS** |
| „Restart process after deployment" | **AUS** (den Prozesswechsel macht `pm2 startOrReload` im Deploy) |

Ergebnis: `/home/ploi/help.pukalani.app/` existiert. Die neue Site-ID notieren
— sie wird in Schritt 2 gebraucht und gehört danach in die Hosts-Doku
(Spalte „ploi-Site").

## Schritt 2 — nginx-Vhost auf 127.0.0.1:3006

ploi schreibt für NodeJS-Sites **keinen** Proxy-Vhost — ohne diesen Schritt
liefert nginx statisches `/public` (403/404). Den bestehenden Vhost einer
laufenden Site als Vorlage nehmen und nur Host + Port tauschen:

```bash
TOKEN=$(cat ~/.maui-secrets/ploi-api.token)
SRV=118713
SITE=<neue Site-ID>

# Vorlage holen (portfolio ist die einfachste Site: ein Host, ein Port)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://ploi.io/api/servers/$SRV/sites/<portfolio-site-id>/nginx-configuration" \
  | jq -r .content > /tmp/help-vhost.conf
```

In `/tmp/help-vhost.conf` genau drei Dinge anpassen:

1. `server_name` → `help.pukalani.app;`
2. alle Pfade `portfolio.pukalani.app` → `help.pukalani.app`
   (Log-Dateien, `root`, Include-Verzeichnis `/home/ploi/<site>/…`)
3. im `location / { … }`-Block: `proxy_pass http://127.0.0.1:3006;`

Der `location /`-Block muss so aussehen (WebSocket-Header inklusive — auf
diesem Server gibt es **kein** `connection_upgrade`-Map, deshalb
`$http_connection` direkt):

```nginx
location / {
    proxy_pass http://127.0.0.1:3006;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $http_connection;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

Die SSL-Zeilen der Vorlage **unverändert übernehmen** — sie zeigen auf
`/etc/letsencrypt/live/pukalani.app/` (die geteilte Zonen-Lineage mit dem
Wildcard). Genau deshalb braucht help kein eigenes Zertifikat.

Hochladen + nginx neu laden:

```bash
jq -Rs '{content: .}' /tmp/help-vhost.conf > /tmp/help-vhost.json
curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d @/tmp/help-vhost.json \
  "https://ploi.io/api/servers/$SRV/sites/$SITE/nginx-configuration"
curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
  "https://ploi.io/api/servers/$SRV/services/nginx/restart"
```

## Schritt 3 — Server-.env anlegen

Nitro liest zur Laufzeit **keine** .env-Datei — `ops/ecosystem-help.config.cjs`
parst sie beim `pm2 startOrReload … --update-env` und hebt sie in die
Prozess-Umgebung.

```bash
ssh ploi@49.13.211.173 'umask 077; cat > /home/ploi/help.pukalani.app/.env' <<"EOF"
# Hilfe-Site — öffentlich, read-only, ohne Konto. Sie rendert nur Markdown aus
# apps/help/content/ und spricht im Normalbetrieb NIE mit Appwrite. Die
# Appwrite-Werte bleiben LEER; sie stehen nur da, damit die Fundament-Layer
# booten. Deshalb hat die App einen eigenen /api/health ohne Appwrite.
NUXT_APPWRITE_KEY=
NUXT_APPWRITE_MIGRATIONS_KEY=

NUXT_PUBLIC_APPWRITE_ENDPOINT=
NUXT_PUBLIC_APPWRITE_PROJECT_ID=
NUXT_PUBLIC_APPWRITE_DATABASE_ID=

NUXT_PUBLIC_APP_URL=https://help.pukalani.app
NUXT_PUBLIC_I18N_BASE_URL=https://help.pukalani.app
EOF
ssh ploi@49.13.211.173 'chmod 600 /home/ploi/help.pukalani.app/.env && ls -l /home/ploi/help.pukalani.app/.env'
```

Bewusst **nicht** gesetzt:

- `NUXT_APPWRITE_MIGRATIONS_KEY` mit Wert — Migrations-Keys gehören nie auf
  einen Laufzeit-Server (und diese Site hat kein Schema).
- `NUXT_REDIS_URL` — die Site hat keine Schreibpfade; der In-Memory-Rate-Limit
  pro Instanz reicht. Nachrüstbar (`redis://127.0.0.1:6379`), falls sie je
  etwas Schreibendes bekommt.
- `NUXT_SMTP_*` — sie verschickt nichts.

## Schritt 4 — Release-Verzeichnis und ops-Ordner

Der Deploy rsyncht nach `/home/ploi/releases/help/<sha>/` und
`/home/ploi/help.pukalani.app/ops/`. rsync legt nur die **letzte**
Verzeichnisebene an — die Elternpfade müssen existieren:

```bash
ssh ploi@49.13.211.173 'mkdir -p /home/ploi/releases/help /home/ploi/help.pukalani.app/ops && ls -ld /home/ploi/releases/help /home/ploi/help.pukalani.app/ops'
```

## Schritt 5 — TLS: NICHTS tun

> **Auf der Site `help.pukalani.app` niemals „Add certificate" oder
> „Force-renew" drücken.**

ploi leitet den certbot-Lineage-Namen aus der **Basis-Domain** ab: jede
Anforderung — egal für welche Site — überschreibt
`/etc/letsencrypt/live/pukalani.app/`, also das Wildcard, das **alle**
Kundenhosts ausliefern. Am 2026-07-27 waren `platform` und `demo` deswegen
~40 Minuten TLS-tot.

Der Host braucht auch gar nichts: die Wildcard `*.pukalani.app` deckt ihn ab,
und der DNS-Wildcard-Eintrag zeigt bereits auf `49.13.211.173`. **Vorab
gemessen (2026-07-27, vor Anlage der Site):**

```
$ echo | openssl s_client -connect 49.13.211.173:443 -servername help.pukalani.app \
    | openssl x509 -noout -subject -ext subjectAltName
subject=CN=*.pukalani.app
X509v3 Subject Alternative Name: DNS:*.pukalani.app
$ curl -o /dev/null -w '%{http_code}\n' --resolve help.pukalani.app:443:49.13.211.173 https://help.pukalani.app/
404
```

Der TLS-Handshake ist also **schon grün, bevor es die Site gibt** (nginx
liefert dem unbekannten Host den Default-Vhost mit demselben Wildcard aus);
nur HTTP antwortet noch 404. Genau das ändert Schritt 2.

`help` steht außerdem bereits in `RESERVED_SUBDOMAINS`
(`packages/control/schemas/tenant.ts`) — kein Selbstbedienungs-Kunde kann den
Namen beantragen. Nichts zu tun.

## Schritt 6 — Erster Deploy

GitHub → Actions → Workflow **Deploy** → *Run workflow* auf `main`
(`workflow_dispatch` umgeht den Doku-Skip und deployt immer).

Der Lauf baut jetzt **sechs** Apps und liefert sie nacheinander aus; help ist
die letzte. Erwartete Ausgabe am Ende des help-Blocks:

```
[help] ✔ Prod läuft durchgängig auf <sha>
```

**Wenn der help-Block hängt** („Prod meldet 'n/a'"), in dieser Reihenfolge
prüfen:

```bash
ssh ploi@49.13.211.173 'pm2 list; pm2 logs helppukalaniapp --lines 50 --nostream'
ssh ploi@49.13.211.173 'curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3006/api/health'
```

- Prozess fehlt → `ops/`-rsync oder Ecosystem-Pfad prüfen (Schritt 4).
- Prozess läuft, 127.0.0.1:3006 antwortet, aber der Host nicht → nginx-Vhost
  (Schritt 2), `nginx -t` im ploi-Panel.
- `/api/health` liefert 500 → die App zieht doch den Core-Health; prüfen, dass
  `apps/help/server/api/health.ts` im Build gelandet ist.

## Schritt 7 — Abnahme

```bash
# 1) Health mit dem erwarteten Commit, DREI Treffer in Folge
for i in 1 2 3; do curl -fsS https://help.pukalani.app/api/health; echo; sleep 2; done

# 2) TLS aller Hosts (help muss grün sein und die anderen unverändert)
node scripts/ops/verify-tls.mjs

# 3) Startseite kommt wirklich aus der help-App
curl -sS https://help.pukalani.app/ | grep -io '<title>[^<]*</title>'
curl -sS -o /dev/null -w 'http=%{http_code}\n' https://help.pukalani.app/
```

Erwartet: `{"ok":true,"build":"<sha>"}` dreimal identisch, TLS-Wächter
`✔ Alle Hosts …`, HTTP 200 mit dem Hilfe-Titel (nicht der ploi-Default-Seite
und nicht der Landing).

## Schritt 8 — Nachbereitung

- **Hosts-Doku:** in `docs/content/2.architektur/6.hosts-und-ports.md` die
  ploi-Site-ID eintragen und den `::warning`-Block auf „live" kürzen.
- **UptimeRobot** (5-Minuten-Takt, Mail an David): Monitor auf
  `https://help.pukalani.app/api/health` — **HEAD ist in Ordnung**, der
  Handler ist methodenneutral (`health.ts`, nicht `health.get.ts`).
- **Reboot-Festigkeit:** `pm2 save` macht der Deploy; `@reboot pm2 resurrect`
  steht bereits im ploi-Crontab und gilt für alle Prozesse.
- **DECISION-LOG / README:** Eintrag 14 als erledigt vermerken.
