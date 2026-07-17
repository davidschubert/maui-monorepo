# Deployment-Runbook — comments (Phase 17)

Stand: 2026-06-28. Praktischer Leitfaden, um die App in Produktion zu bringen.
Ergänzt [CONCEPT.md](CONCEPT.md) (A9 Deployment, A11 Env, A3 Session-Cookie).

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
4. **Zwei API-Keys** (Konzept A2):
   - **Runtime-Key** (`nuxt-ssr-prod`): Scopes `sessions.write`,
     `users.read`, `users.write`, `rows.read`, `rows.write`, `health.read`.
   - **Migrations-Key** (`migrations-prod`): Scopes `databases.*`, `tables.*`,
     `columns.*`, `indexes.*`. **Nur für den Migrationslauf** — kommt NIE auf den
     App-Server.
5. **SMTP** in der Appwrite-Installation (`.env` der Instanz, nicht in der
   Console) konfigurieren, sonst keine Auth-Mails.
6. **TLS** für die Appwrite-Subdomain (ploi.io/Caddy/Traefik) — Cookie braucht `secure`.

## 2. Migrationen gegen Prod laufen lassen

Migrationen laufen **von einer vertrauenswürdigen Maschine** (lokal/CI) gegen den
Prod-Endpoint — mit dem **Migrations-Key**, nicht vom App-Server aus.

```bash
# Prod-Werte in eine separate Datei (NICHT committen):
cp apps/comments/.env.example apps/comments/.env.production
#   → NUXT_PUBLIC_APPWRITE_ENDPOINT = https://api.<domain>/v1
#   → NUXT_PUBLIC_APPWRITE_PROJECT_ID / _DATABASE_ID = Prod-Werte
#   → NUXT_APPWRITE_MIGRATIONS_KEY = Prod-Migrations-Key

# Reihenfolge: Fundament zuerst (system), dann Features. Alle idempotent (409→skip).
for L in system comments moderation admin; do
  pnpm --filter @maui/$L exec node --experimental-strip-types \
    --env-file=../../apps/comments/.env.production \
    scripts/migrations/*.ts   # bzw. die migrate-Skripte je Layer
done
```

> Praktisch: die `migrate`-Skripte je Layer zeigen auf die Dev-`.env`. Für Prod
> entweder `.env.production` an dieselbe Stelle kopieren und `pnpm --filter @maui/<L> migrate`
> laufen lassen, oder die Migrations-Dateien direkt mit `--env-file=.env.production`
> aufrufen. Tabellen-Owner: **system** (audit_logs, app_config, notifications,
> presence) · **comments** (comments, comment_votes) · **moderation** (reports) ·
> **admin** (changelog). `core`/`themes` haben keine Tables.

Danach den **Avatar-Bucket** anlegen (nutzt den Migrations-Key):
```bash
node --experimental-strip-types --env-file=apps/comments/.env.production \
  apps/comments/scripts/setup-avatars-bucket.ts
```
→ Die Bucket-ID kommt als `NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET` in die App-Env (Schritt 3).

**Bootstrap-Admin:** der erste Owner braucht das `admin`-Label. In der Appwrite
Console beim eigenen User unter *Labels* `admin` setzen (Self-Lockout-Schutz greift
danach).

## 3. ploi.io-Site konfigurieren

| Feld | Wert |
|---|---|
| Root Path | `apps/comments` |
| Install/Build | `npm i -g pnpm && pnpm install --frozen-lockfile && pnpm --filter comments build` |
| Start Command | `node apps/comments/.output/server/index.mjs` |
| Port | Nitro hört auf `PORT` (Default 3000) — ploi.io-Reverse-Proxy darauf zeigen |

**Server Environment Variables** in ploi.io (NICHT im Repo):
```
NUXT_APPWRITE_KEY=<Runtime-Key>                     # server-only
NUXT_PUBLIC_APPWRITE_ENDPOINT=https://api.<domain>/v1
NUXT_PUBLIC_APPWRITE_PROJECT_ID=<prod>
NUXT_PUBLIC_APPWRITE_DATABASE_ID=<prod>
NUXT_PUBLIC_APPWRITE_AVATARS_BUCKET=<bucket-id aus Schritt 2>
NUXT_PUBLIC_APP_URL=https://<app-domain>
```
> **NICHT** auf den Server: `NUXT_APPWRITE_MIGRATIONS_KEY`. Der gehört nur zum
> Migrationslauf (Schritt 2).

## 4. Deploy auslösen

- **Jetzt:** `.github/workflows/deploy.yml` ist ein Skeleton (manuell, no-op).
- **Aktivieren:** in ploi.io einen Deploy-Webhook erzeugen, die URL als Repo-Secret
  `PLOI_DEPLOY_WEBHOOK_REDDIT_COMMENTS` hinterlegen, den auskommentierten Job in
  `deploy.yml` einkommentieren. Dann deployt jeder Push auf `main` automatisch.
- **Alternativ:** ploi.io direkt aufs Repo zeigen lassen (Quick Deploy bei Push).

## 5. Verifikation nach dem Deploy

- [ ] `GET https://<app-domain>/api/health` → ok
- [ ] Registrierung + Login (Session-Cookie `a_session_<PROJECT_ID>`, httpOnly+secure)
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
