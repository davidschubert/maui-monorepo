# Spike Minimal-S3 + S2-Probe (Gate G2) — Wegwerf

Decision Gate aus [MULTI-SITE-PLATFORM-STRATEGIE.md](../../docs/plans/MULTI-SITE-PLATFORM-STRATEGIE.md):
Browser-PoC „2 Projekte × 2 Hostnames × Auth × Realtime" — vor den
Control-Plane-Verträgen (M6).

## Aufbau

EIN h3-Prozess (`server.mjs`, Port 3060) bedient `alpha.localhost` und
`beta.localhost` gegen ZWEI echte Appwrite-Projekte (`s3-alpha`/`s3-beta`)
auf der lokalen HAUPT-Instanz (per Provisioner-Console-Account angelegt —
nicht die wacklige Wegwerf-VM). Verträge in S0-Form: Host-Resolver ohne
Default-Fallback, Cookie `a_session_<projectId>`, Secret-Resolver mit
enumerierten Scopes, JWT via Session. Pro Site eine Test-Seite mit
Login/Me/Realtime/Ping-Buttons; Realtime nach dem Core-Muster
(`Appwrite.Realtime`-Klasse, `setJWT` VOR dem Connect, Channel
`tablesdb.main.tables.pings.rows`).

## Ergebnis — ✅ MINIMAL-S3 BESTANDEN (2026-07-15, Browser-verifiziert)

- **Parallele Sessions im selben Browser:** alpha UND beta gleichzeitig
  eingeloggt (`/api/me` → user@alpha.local bzw. user@beta.local) —
  Cookies sind host-scoped, keine Kollision.
- **Realtime projektgebunden über EINEN Prozess:** Ping in alpha →
  RT-EVENT nur im alpha-Tab (2×), Ping in beta → RT-EVENT nur im beta-Tab;
  **Kreuz-Check sauber** (kein beta-Event im alpha-Log).
- Host-Auflösung: unbekannter Host → 404 (kein Default), Origin-Prüfung
  über registrierte Web-Platforms je Projekt.

### Befunde (für Voll-S3 / G3 + Provisioner)

1. **JWT-Event-Lieferung für `read(users)`-Channels im Spike nicht
   reproduziert** — mit `read(any)` liefert derselbe Socket sofort.
   Cores Produktions-Muster funktioniert nachweislich täglich (M2-Toggle,
   Notifications) → Diskrepanz liegt im Spike-Setup (vermutlich
   setJWT-/Connect-Detail des Web-SDK v26). MUSS in Voll-S3 (G3) geklärt
   werden, bevor Klasse-B-Sites private Realtime-Channels nutzen.
2. **Platform-IDs kollidieren projektübergreifend** auf dieser Instanz
   (409 bei web-alpha im zweiten Projekt) — wie Key-IDs global eindeutig
   wählen (Provisioner: `web-<site>-<host>`), obwohl es auf der
   Wegwerf-Instanz in S0 noch pro Projekt funktionierte. Versions-/
   Zustandsabhängig → IMMER global eindeutige IDs vergeben.
3. Realtime-Events tragen doppelte Namensräume
   (`databases.…documents.create` UND `databases.…tables.rows…`) —
   Handler nie auf exakte Event-Strings pinnen (Core tut das richtig:
   endsWith('.create')).

## S2-Probe (Custom Domains self-hosted)

`GET /v1/proxy/rules` (Console-Session) → `{"total":0,"rules":[]}` — die
**API-Oberfläche existiert self-hosted**. Rule-Anlage + CNAME-Verify +
Zertifikats-Flow brauchen eine ECHTE Domain → der e2e-Beweis reitet auf
**Phase 17** mit (dort als Pflichtpunkt vor jedem Custom-Domain-Feature).

## Reproduzieren

```bash
cd spikes/s3-minimal && pnpm install --ignore-workspace
# sites-secrets.json braucht die runtime-Keys der Projekte s3-alpha/s3-beta
node server.mjs   # dann alpha.localhost:3060 + beta.localhost:3060 im Browser
```

Aufräumen: Projekte `s3-alpha`/`s3-beta` in der Console löschen, wenn nicht
mehr gebraucht.
