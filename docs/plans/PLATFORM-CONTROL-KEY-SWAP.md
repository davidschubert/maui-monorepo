# Runbook: dedizierter Read-only-Control-Plane-Key (platform)

> **Status:** wartet auf David (Key-Erstellung ist Console/OTP-gebunden).
> Freigegeben (2026-07-23). ~5 Minuten. Ziel: least-privilege.

## Warum

Die platform-App liest das tenants-Register CROSS-Projekt aus dem `studio`-
Projekt (`NUXT_PLATFORM_CONTROL_*` in `/home/ploi/platform.pukalani.app/.env`).
Als v1-Kompromiss steht dort aktuell der **studio-RUNTIME-Key** (mit
Schreibrechten). Der Leser braucht aber nur `rows.read`. Der Tausch entfernt
unnötige Schreibrechte vom App-Server.

## Schritt 1 — Read-only-Key erstellen (David, Appwrite Console)

1. Console → Projekt **studio** → *Overview* → *API Keys* → *Create API Key*.
2. Name: `platform-control-readonly`. Scopes: **NUR `rows.read`** (nichts sonst).
   Expiration: nach Wunsch (oder nie).
3. Key-Secret kopieren (einmalig sichtbar).

## Schritt 2 — Testen VOR dem Tausch (curl, kein Risiko)

```bash
# <KEY> = der neue Key. Muss die tenants lesen können:
curl -s -H "X-Appwrite-Project: studio" -H "X-Appwrite-Key: <KEY>" \
  "https://api.pukalani.app/v1/tablesdb/main/tables/tenants/rows?queries%5B%5D=%7B%22method%22%3A%22limit%22%2C%22values%22%3A%5B5%5D%7D" \
  | python3 -m json.tool | head
# Erwartung: JSON mit den tenants-Rows (u.a. demo.pukalani.app). 401 → Scope/Projekt falsch.
```

## Schritt 3 — Tauschen + reload (Server)

```bash
ssh ploi@49.13.211.173
cp /home/ploi/platform.pukalani.app/.env /home/ploi/platform.pukalani.app/.env.bak  # Rollback
# NUXT_PLATFORM_CONTROL_KEY=<alter studio-runtime-key> → <neuer readonly-key> ersetzen
# (nur diese eine Zeile; die anderen NUXT_PLATFORM_CONTROL_* bleiben)
pm2 startOrReload /home/ploi/platform.pukalani.app/ops/ecosystem-platform.config.cjs --update-env
```

## Schritt 4 — Verifizieren

```bash
curl -s https://demo.pukalani.app/ -o /dev/null -w '%{http_code}\n'          # 200
curl -s https://gibtsnicht.pukalani.app/ -o /dev/null -w '%{http_code}\n'     # 404 (Resolver liest weiter)
curl -s https://platform.pukalani.app/api/health                              # ok:true
```

Bricht die Tenant-Auflösung (demo → 500/404 statt 200): `.env.bak`
zurückkopieren + erneut `pm2 reload`. Danach den studio-Runtime-Key aus der
Server-.env entfernt halten.

## Zusatz-Finding (2026-07-23)

Die lingernde Console-Session in `~/.appwrite-secrets/console.jar` gehört zu
`provisioner@pukalani.app` — ein Account, der laut Cleanup (Task #69) gelöscht
sein sollte, aber noch eine gültige Session hat. **Bitte prüfen und den
Account + die Session entfernen** (Console → dein Account/Team-Mitglieder;
ggf. war die Löschung damals unvollständig). Bis dahin: `console.jar` löschen.
