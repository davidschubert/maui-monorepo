# Aktivierungs-Plan — Changelog Track 2B (Appwrite Function)

Stand: 2026-07-01. Plan-Dokument, **kein Code-Change nötig** — die Function
[`functions/changelog-draft`](../../functions/changelog-draft) ist deploy-bereit
(siehe [OPEN-ITEMS](../OPEN-ITEMS.md), Roadmap-Eintrag Track 2B). Dieses Dokument
beschreibt die Aktivierung, sobald Phase 17 (Prod-Appwrite + öffentliche Domain,
[DEPLOYMENT.md](../DEPLOYMENT.md)) steht.

**Was passiert nach der Aktivierung:** GitHub-Release veröffentlicht →
GitHub-Webhook (HMAC-SHA256-signiert) → Function ermittelt das Vorgänger-Tag
(`GET /repos/:repo/tags`), holt die Commits dazwischen über die Compare-API,
parst sie mit der geteilten Logik (`src/parse.js`, identisch zu Track 2A) und
legt **einen Entwurf** (`published:false`) in der `changelog`-Table an. Der wird
im Dashboard unter **Changelog** poliert und veröffentlicht — wie bisher.

---

## 1. Voraussetzungen (Blocker — ohne die geht nichts)

| # | Voraussetzung | Warum |
|---|---|---|
| V1 | **Prod-Appwrite** (self-hosted ≥ 1.9.5) läuft, per **HTTPS** öffentlich erreichbar (z. B. `api.<domain>/v1`) | GitHub muss den Webhook zustellen können; `localhost` scheidet aus (der Grund, warum 2A existiert) |
| V2 | **Functions-Domain** der Instanz konfiguriert: `_APP_DOMAIN_FUNCTIONS=functions.<domain>` in der Appwrite-`.env` + **Wildcard-DNS** `*.functions.<domain>` + **TLS** (Traefik/Caddy stellt Zertifikate aus) | Jede Function bekommt eine generierte Subdomain — das wird die Payload-URL des Webhooks |
| V3 | `changelog`-Table existiert in der Prod-DB (admin-Layer-Migration gelaufen, DEPLOYMENT.md Schritt 2) | Die Function schreibt per `createRow` in `tableId: 'changelog'` |
| V4 | **Appwrite CLI** lokal installiert + eingeloggt gegen die **Prod**-Instanz (`appwrite login`, Projekt `comments` bzw. Prod-Project-ID) | Deploy läuft über `appwrite push` aus dem Repo-Root (nutzt `appwrite.config.json`) |
| V5 | Release-Prozess aktiv: release-please-PR-Merge erzeugt Tag + **GitHub-Release** (`action=published`) | Nur `release/published`-Events lösen den Draft aus; Draft-/Pre-Release-Anlegen ohne „publish" tut nichts |

> **Hinweis Project-ID:** `appwrite.config.json` trägt aktuell `projectId: comments`.
> Weicht die Prod-Project-ID ab, vor dem Push anpassen (oder per
> `appwrite push --project-id <prod>` überschreiben). Perspektivisch steht die
> Umbenennung `appwrite.config.json` → `appwrite.config.json` an (neuer CLI-Name,
> OPEN-ITEMS „Kleinkram") — bei der Gelegenheit miterledigen.

## 2. Env-Vars / Secrets der Function (laut Code, `src/main.js`)

Vom Betreiber zu setzen (Console → Functions → changelog-draft → Settings →
Variables, oder per CLI):

| Variable | Pflicht | Wert | Verwendung im Code |
|---|---|---|---|
| `APPWRITE_DATABASE_ID` | **ja** | Prod-Database-ID (z. B. `main`) | Ziel-DB des `createRow` — fehlt sie → 500 „Function nicht konfiguriert" |
| `GITHUB_REPO` | **ja** | `davidschubert/maui-monorepo` (owner/repo) | Tags- + Compare-API |
| `GITHUB_WEBHOOK_SECRET` | **ja** | langer Zufallswert (`openssl rand -hex 32`) | HMAC-SHA256-Verifikation des Webhooks **und** Gate des manuellen Pfads (`x-manual-secret`) — ohne Secret lehnt die Function jeden Webhook ab |
| `GITHUB_TOKEN` | optional | Fine-grained PAT, nur `Contents: read` | Privates Repo bzw. höheres API-Rate-Limit (5000/h statt 60/h pro IP) |

**Automatisch von Appwrite bereitgestellt** (nichts zu tun):
`APPWRITE_FUNCTION_API_ENDPOINT`, `APPWRITE_FUNCTION_PROJECT_ID` und der
**dynamische API-Key** im Header `x-appwrite-key` — dessen Rechte kommen aus den
Function-**Scopes** in `appwrite.config.json` (`rows.read`, `rows.write`). Beim Deploy
gegenprüfen, dass die 1.9.5-Instanz genau diese Scope-Namen kennt (README-Hinweis;
ggf. heißen sie in der Console `tablesDB.rows.*`). Einen statischen
`APPWRITE_API_KEY`-Fallback gibt es seit dem Audit 2026-07-05 nicht mehr — die
Function nutzt ausschließlich den dynamischen Key und lehnt ohne ihn ab.

## 3. Payload-URL des Webhooks

GitHub soll den **rohen** HTTP-Request an die Function liefern (die
HMAC-Verifikation rechnet über `req.bodyRaw`). Dafür ist die
**Function-Domain** der richtige Weg — *nicht* der REST-Endpoint
`POST /v1/functions/.../executions` (der erwartet Appwrite-Header und verpackt
den Body).

- Console → Functions → changelog-draft → **Domains**: dort steht die generierte
  Domain, z. B. `https://<slug>.functions.<domain>/` — das ist die Payload URL.
- Optional stattdessen eine sprechende **Custom Domain** an die Function hängen
  (z. B. `hooks.<domain>`), dann übersteht die URL auch Re-Deploys garantiert.
- Die Function ist `execute: ["any"]` (bewusst — GitHub kommt als Gast), der
  Schutz ist die HMAC-Signatur bzw. `x-manual-secret`.

---

## 4. Schritt-für-Schritt-Todo-Liste

Legende: **[Console]** = manuell in der Appwrite Console · **[GitHub]** = manuell
in den GitHub-Repo-Settings · **[CLI]** = per Terminal/Appwrite CLI · **[Server]**
= SSH auf den Appwrite-Host.

### Phase A — Vorbereitung

1. **[Server]** Functions-Domain aktivieren: in der Appwrite-`.env` der Instanz
   `_APP_DOMAIN_FUNCTIONS=functions.<domain>` setzen, `docker compose up -d`
   zum Übernehmen. DNS: Wildcard `*.functions.<domain>` → Server-IP. TLS-Ausstellung
   nach dem ersten Aufruf prüfen.
2. **[CLI]** Secret erzeugen und sicher ablegen (Passwort-Manager):
   `openssl rand -hex 32` → das wird `GITHUB_WEBHOOK_SECRET` (Appwrite) **und**
   das Webhook-Secret (GitHub) — exakt derselbe Wert.
3. **[Console]** Prüfen, dass die `changelog`-Table in der Prod-DB existiert
   (sonst DEPLOYMENT.md Schritt 2 / admin-Migration nachholen).

### Phase B — Function deployen

4. **[CLI]** Login gegen Prod: `appwrite login` (Endpoint `https://api.<domain>/v1`,
   Prod-Projekt wählen). Bei abweichender Prod-Project-ID: `appwrite.config.json` anpassen.
5. **[CLI]** Aus dem **Repo-Root**: `appwrite push functions` (ältere CLI:
   `appwrite push function`) → legt die Function `changelog-draft` an
   (node-22, Entrypoint `src/main.js`, Build `npm install`, Timeout 30 s,
   Scopes `rows.read`/`rows.write`) und lädt `functions/changelog-draft` als
   Deployment hoch. Warten bis der Build „ready" ist.
6. **[Console]** Functions → changelog-draft → Settings → **Scopes** verifizieren:
   die Rows-Read/Write-Scopes müssen aktiv sein (exakte Namen der 1.9.5-Instanz
   können von `appwrite.config.json` abweichen — dann in der Console nachziehen).
7. **[Console]** Settings → **Variables** setzen: `APPWRITE_DATABASE_ID`,
   `GITHUB_REPO`, `GITHUB_WEBHOOK_SECRET` (aus Schritt 2), optional `GITHUB_TOKEN`.
   *(Alternativ [CLI]: `appwrite functions create-variable --function-id
   changelog-draft --key ... --value ...` je Variable.)*
8. **[Console]** Functions → changelog-draft → **Domains**: generierte
   Function-URL notieren (Payload URL für Schritt 10). `curl https://<function-url>/`
   sollte antworten (401/422-JSON ist ok — beweist Erreichbarkeit + TLS).

### Phase C — Smoke-Test über den manuellen Pfad (vor GitHub!)

9. **[CLI]** Manuellen Pfad testen (nutzt dieselbe DB-Schreiblogik, aber ohne
   GitHub-Webhook):
   ```bash
   curl -X POST https://<function-url>/ \
     -H 'Content-Type: application/json' \
     -H 'x-manual-secret: <GITHUB_WEBHOOK_SECRET>' \
     -d '{ "since": "v1.4.0", "version": "smoke-test" }'
   ```
   Erwartet: `{ ok: true, id, counted, category }`. Danach **[Console/Dashboard]**:
   Entwurf erscheint im Admin-Dashboard unter Changelog (unveröffentlicht) →
   Smoke-Test-Entwurf wieder löschen. Negativtest: gleicher Call **ohne**
   Header → muss 401 liefern.

### Phase D — GitHub-Webhook einrichten

10. **[GitHub]** Repo → Settings → Webhooks → **Add webhook**:
    - **Payload URL:** Function-URL aus Schritt 8
    - **Content type:** `application/json` (wichtig — kein form-encoded, sonst
      passt der HMAC-Body nicht zum JSON-Parsing)
    - **Secret:** Wert aus Schritt 2
    - **SSL verification:** enabled (Default)
    - **Events:** „Let me select individual events" → nur **Releases**
11. **[GitHub]** Nach dem Anlegen schickt GitHub einen `ping`-Event. Unter
    Webhooks → Recent Deliveries prüfen: Response **200** mit
    `{ ok: true, skipped: "event ping ignoriert" }` — das bestätigt zugleich die
    **HMAC-Verifikation** (bei falschem Secret käme 401 „Ungültige Signatur").
12. **[CLI]** HMAC-Negativtest (Signatur-Pflicht bestätigen):
    ```bash
    curl -X POST https://<function-url>/ \
      -H 'Content-Type: application/json' -H 'X-GitHub-Event: release' \
      -d '{}'
    ```
    → muss **401** liefern (fehlende/ungültige Signatur). Damit ist belegt, dass
    niemand ohne Secret Drafts anlegen kann.

### Phase E — End-to-End-Test

13. **[GitHub]** Test-Release veröffentlichen — am saubersten der reguläre Weg
    (release-please-PR mergen → Release wird published). Alternativ ein manuelles
    Release auf einem Wegwerf-Tag (z. B. `v0.0.1-e2e`) anlegen und **publishen** —
    Achtung: das Tag muss ein Vorgänger-Tag haben, sonst antwortet die Function
    422 („Kein Vorgänger-Tag").
14. **[GitHub]** Recent Deliveries: `release`-Delivery → Response 200,
    Body `{ ok: true, id, counted, ... }`.
15. **[Console]** Functions → changelog-draft → **Executions**: Log
    `Entwurf <id> aus N Commit(s) angelegt.` sichtbar.
16. **[Browser]** Admin-Dashboard → Changelog: Entwurf `Entwurf v<x.y>` mit
    gruppierten Stichpunkten (Neue Funktionen / Verbesserungen /
    Fehlerbehebungen) vorhanden, `published:false`. Polieren → veröffentlichen →
    „Was ist neu"-Popover + öffentliche `/changelog`-Seite zeigen ihn.
    Test-Release/-Tag danach aufräumen, Test-Entwurf löschen.

### Phase F — Abschluss

17. **[Doku]** [CHANGELOG-WORKFLOW.md](../CHANGELOG-WORKFLOW.md) aktualisieren:
    2B von „späterer Ausbau" auf **aktiv** setzen, 2A als manuellen Fallback
    kennzeichnen (s. Abschnitt 7). README/OPEN-ITEMS-Status nachziehen, committen.

---

## 5. Rollback / Deaktivierung

Drei Stufen, je nach Bedarf — alle ohne Code-Change:

1. **Pausieren (weich):** **[GitHub]** Webhook → „Active"-Häkchen entfernen.
   GitHub liefert nichts mehr zu; Function bleibt deployt. Re-Aktivierung = Häkchen
   setzen (+ ggf. verpasste Releases via Redeliver oder manuellem Pfad nachholen).
2. **Function deaktivieren:** **[Console]** Functions → changelog-draft →
   Settings → **Enabled** aus (oder `enabled: false` in `appwrite.config.json` +
   `appwrite push functions`). Eingehende Webhooks laufen ins Leere → GitHub
   zeigt fehlgeschlagene Deliveries (harmlos, aber Stufe 1 zusätzlich machen).
3. **Vollständig entfernen:** **[GitHub]** Webhook löschen + **[Console]**
   Function löschen. Es gibt keinen weiteren Zustand — die Function ist stateless,
   angelegte Entwürfe bleiben normale `changelog`-Rows (bei Bedarf im Dashboard
   löschen).

In **allen** Fällen bleibt Track 2A (`pnpm changelog:draft`) sofort einsatzfähig —
es gibt keine Migrations- oder Datenabhängigkeit zwischen den Tracks.

## 6. Betrieb

**Log-Einsicht**

- **Appwrite-Seite:** Console → Functions → changelog-draft → **Executions**
  (Status, Dauer, `log()`/`error()`-Ausgaben je Ausführung; `logging: true` ist
  in `appwrite.config.json` gesetzt).
- **GitHub-Seite:** Repo → Settings → Webhooks → **Recent Deliveries** (Request +
  Response jeder Zustellung, mit **Redeliver**-Button für Wiederholungen).

**Fehlerfälle + Verhalten (laut Code)**

| Fall | Verhalten | Maßnahme |
|---|---|---|
| Falsches/fehlendes Secret | 401, kein Draft | Secret auf beiden Seiten abgleichen (Schritt 2) |
| GitHub-**Rate-Limit** (`/tags`, `/compare`) | Ohne Token 60 req/h **pro Server-IP** — teilt sich die IP andere GitHub-Zugriffe, kann 403/429 kommen: `/tags`-Fail → 422 „Kein Vorgänger-Tag", `/compare`-Fail → Exception → 500 | `GITHUB_TOKEN` setzen (5000/h) — bei Releases (1–2 API-Calls/Release, seltenes Event) praktisch nie kritisch. Recovery: Delivery in GitHub **redelivern** oder manueller Pfad |
| **Große Releases** | Die Compare-API liefert im `commits`-Array **max. 250 Commits**; die Function paginiert nicht → bei >250 Commits fehlen die ältesten im Entwurf (kein Fehler, still) | Bekannte Kante. Bei Mammut-Releases Entwurf gegen `git log` gegenprüfen oder 2A lokal laufen lassen (liest die volle Range). Optional später: Pagination in `compareSubjects` |
| Vorgänger-Tag nicht in den ersten 100 Tags (`per_page=100`, keine Pagination) | 422 | Manueller Pfad mit explizitem `since` (Schritt 9) |
| Erster Release überhaupt (kein Vorgänger-Tag) | 422 mit klarer Meldung | Manueller Pfad mit `since=<initial-sha>` |
| Keine relevanten Commits (nur chore/docs/…) | 200, `counted: 0`, **kein** Draft | Nichts — gewollt |
| Timeout (30 s) / Appwrite-Ausfall | Execution failed; GitHub retried **nicht** automatisch | Delivery redelivern (idempotent genug: schlimmstenfalls Duplikat-Draft) |
| **Duplikat-Drafts** (Redeliver, doppeltes Publish) | Es gibt keinen Dedup-Check — jeder erfolgreiche Lauf legt einen neuen Draft an | Unkritisch: Drafts sind `published:false`, im Dashboard löschen. Optional später: vor `createRow` auf existierenden Draft gleicher `version` prüfen |
| Draft-Spam-Versuch von Gästen | Nicht möglich: Webhook-Pfad HMAC-gated, manueller Pfad `x-manual-secret`-gated (timing-safe) | — |

**Secret-Rotation:** neuen Wert erzeugen → zuerst als Function-Variable setzen,
direkt danach im GitHub-Webhook — zwischen den beiden Schritten schlagen
Deliveries fehl (Redeliver danach). Bei `GITHUB_TOKEN`: Ablaufdatum des PAT im
Kalender vermerken.

## 7. Abgrenzung zu Track 2A — bleibt als Fallback

**Ja, 2A bleibt** (Empfehlung), wird aber vom Standard- zum Ausnahme-Werkzeug:

| | Track 2A (`pnpm changelog:draft`) | Track 2B (Function) |
|---|---|---|
| Auslöser | manuell, lokal | GitHub-Release (automatisch) |
| Commit-Quelle | lokales `git log` (volle Range, keine 250er-Kante) | GitHub Compare-API |
| Braucht | lokale `.env` mit Runtime-Key | nichts (läuft in Appwrite) |
| Bleibt für | Ad-hoc-Drafts zwischen Releases (`--since`/`--dry`), Recovery bei 2B-Fehlern (Rate-Limit, >250 Commits, Ausfall), Dev-Instanz | Normalfall pro Release |

Beide teilen `functions/changelog-draft/src/parse.js` (unit-getestet in
`packages/admin/tests/changelog-parse.test.ts`) und schreiben identische
Draft-Rows — sie können koexistieren, ohne sich zu stören. Einzige Disziplin:
nach einem manuellen 2A-Lauf für einen Release, den 2B schon verarbeitet hat,
den Duplikat-Draft löschen. **Achtung Prod-Ziel:** 2A zeigt per `--env-file` auf
`apps/comments/.env` (Dev) — für einen Prod-Draft die
`.env.production` verwenden (vgl. DEPLOYMENT.md und das offene
Migrations-Runner-Finding in OPEN-ITEMS).
