# Spike S0 — Multi-Projekt-Auflösung pro Request (Wegwerf)

Decision Gate aus [docs/plans/MULTI-SITE-PLATFORM-STRATEGIE.md](../../docs/plans/MULTI-SITE-PLATFORM-STRATEGIE.md):
validiert die **FORM der Verträge**, bevor M1 sie festschreibt. Kein Produkt-Code.

## Verträge unter Test

1. **Mandantenauflösung** (`server/siteResolver.mjs`): Host-Header → Site nur
   über das verifizierte Register; unbekannter Host → 404, **keine
   Default-Site**; Kontext eingefroren.
2. **`event.context.site` ohne Runtime-Key** — nur `{siteId, projectId,
   endpoint}` (= das spätere `useSiteConfig()`).
3. **Client-Factories nehmen das `event`** (`server/appwrite.mjs`):
   `createSessionClient(event)` (User-Session → Appwrite-Autorisierung
   bleibt wirksam) und `getSystemClient(siteId, scope)` als server-interner
   Secret-Resolver mit enumerierten Scopes + Audit — der Key hängt NIE am
   Request.
4. **Session-/JWT-Projektbindung:** Cookie `a_session_<projectId>` pro Site;
   Cross-Site-Isolation; Realtime-JWT nur fürs eigene Projekt gültig.

## Ablauf

```bash
# 1. Wegwerf-Appwrite (ci/appwrite) auf Port 8081 — Projektname appwrite-s0
cd ci/appwrite && _APP_HTTP_PORT=8081 docker compose --env-file ci.env \
  --project-name appwrite-s0 up -d traefik appwrite appwrite-realtime \
  appwrite-worker-databases appwrite-worker-deletes mariadb redis

# 2. Zwei Projekte + Keys + Platforms + Test-User (Console-REST wie ci-setup)
cd spikes/s0-multi-project && pnpm install --ignore-workspace
node setup-projects.mjs --endpoint http://localhost:8081/v1

# 3. Spike-Server + Abnahmetests T1–T7
node server/index.mjs &   # Port 3050
node test.mjs

# Teardown
docker compose --project-name appwrite-s0 -f ci/appwrite/docker-compose.yml down -v
```

## Ergebnis — ✅ BESTANDEN (2026-07-14, 12/12 Tests)

Alle Abnahmetests grün gegen eine echte Wegwerf-Appwrite 1.9.5 mit zwei
Projekten: Host-Auflösung (T1), 404 statt Default-Site (T2), Kontext ohne
Key (T3), projekt-eigene httpOnly-Cookies (T4), Cross-Site-Isolation — auch
mit eingeschleustem Session-Secret (T5), anonym bleibt anonym (T6),
Realtime-JWT projektgebunden (T7).

**Konsequenz für M1: Die Verträge können wie entworfen festgeschrieben
werden.** `useSiteConfig()` = `{siteId, projectId, endpoint}`;
Client-Factories nehmen das `event`; `getSystemClient(siteId, scope)` mit
enumerierten Scopes + Audit.

### Learnings (fließen in M1/S1 ein)

1. **S1-Vorab-Datenpunkt:** Projekt-Anlage per Console-REST funktioniert
   self-hosted (Account → Org → Projekt → Key → Platform). ABER:
   `keyId`/`platformId` sind Pflicht-Parameter, und **`keyId` ist GLOBAL
   eindeutig über alle Projekte** — der Provisioner muss projekt-eindeutige
   Key-IDs vergeben (hier: `runtime-<siteId>`).
2. **SSR-Login ist zwingend eine System-Op:** `session.secret` kommt nur
   mit Admin-Key zurück (deshalb nutzt der Core `createAdminClient` im
   Login). Scope `auth-login` gehört damit fest in die enumerierte Liste
   des Secret-Resolvers.
3. **Appwrite-401 muss gemappt werden**, sonst leakt eine ungültige/fremde
   Session als 500 (der Core erledigt das zentral in `server/error.ts` —
   die Platform-App braucht dasselbe).
4. Test-Werkzeug-Falle: Nodes `fetch` (undici) verbietet einen eigenen
   `Host`-Header → `node:http` für Host-basierte Tests verwenden.
   (Produktion unberührt: Browser/Proxies senden echte Hosts.)

Teardown (Stack ist gestoppt, Wiederaufnahme via Schritt 1):
`docker compose --project-name appwrite-s0 -f ci/appwrite/docker-compose.yml down -v`
