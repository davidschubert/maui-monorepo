# Changelog Draft — Appwrite Function (Track 2B)

Vollautomatischer Produkt-Changelog-**Entwurf** aus GitHub-Releases. Läuft
_innerhalb_ von Appwrite und erreicht die DB direkt (löst das `localhost`-Problem
von Track 2A). Teilt die Parsing-Logik mit dem lokalen Generator
(`packages/admin/scripts/changelog-draft.mjs`) über `src/parse.js` — eine Quelle.

> **Status:** deploy-bereit, aber **erst mit Prod + öffentlicher Domain aktiv**
> (Phase 17). GitHub muss den Webhook per HTTPS erreichen können. Lokal/self-hosted
> hinter `localhost` kann GitHub nicht zustellen — bis dahin bleibt Track 2A
> (`pnpm changelog:draft`) der Weg.

## Was sie tut

1. **GitHub-Release-Webhook** (`X-GitHub-Event: release`, `action=published`):
   HMAC-verifiziert, ermittelt das Vorgänger-Tag, holt die Commits dazwischen über
   die GitHub-Compare-API und legt einen Entwurf (`published:false`) an.
2. **Manueller POST** `{ "since": "v1.4.0", "until": "v1.5.0", "version": "v1.5" }`
   zum Testen ohne echten Release (z. B. „Execute now" in der Console).

Den Entwurf polierst du im Dashboard unter **Changelog** und veröffentlichst ihn.

## Deploy

Voraussetzung: Appwrite CLI (`appwrite login`, Projekt gesetzt).

```bash
# aus dem Repo-Root — nutzt appwrite.json
appwrite push function        # legt/aktualisiert die Function "changelog-draft"
```

### Function-Variablen (Console → Functions → changelog-draft → Settings → Variables)

| Variable                | Beispiel                        | Zweck                                    |
|-------------------------|---------------------------------|------------------------------------------|
| `APPWRITE_DATABASE_ID`  | `main`                          | Ziel-DB der `changelog`-Table            |
| `GITHUB_REPO`           | `davidschubert/maui-monorepo`   | Repo für Compare-/Tags-API               |
| `GITHUB_WEBHOOK_SECRET` | _(random)_                      | HMAC-Secret, muss == GitHub-Webhook sein |
| `GITHUB_TOKEN`          | _(optional)_                    | privates Repo / höheres Rate-Limit       |

Der API-Key kommt als **dynamischer Key** (Header `x-appwrite-key`); die in
`appwrite.json` gesetzten Scopes (`tablesDB.rows.read/​write`) müssen aktiv sein.
Beim Deploy die genauen Scope-Namen der laufenden 1.9.5-Instanz gegenprüfen.

### GitHub-Webhook einrichten

Repo → **Settings → Webhooks → Add webhook**:

- **Payload URL:** die Function-Domain aus Appwrite (Functions → Domains).
- **Content type:** `application/json`
- **Secret:** derselbe Wert wie `GITHUB_WEBHOOK_SECRET`.
- **Events:** nur **Releases**.

## Lokaler Selbsttest (ohne Deploy)

Die reine Logik ist unit-getestet: `packages/admin/tests/changelog-parse.test.ts`
(`pnpm --filter @maui/admin test`). Der End-to-End-Pfad (Webhook → Draft) lässt
sich sinnvoll erst gegen die Prod-Instanz testen.
