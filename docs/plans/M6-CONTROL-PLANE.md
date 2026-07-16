# M6 — Control Plane `apps/studio` (Umsetzungsplan)

Stand: 2026-07-16 · Status: **T1 in Umsetzung** (Go David nach Gate G2)
Kontext: Strategie D3 (Hybrid), § 8 Vertrauensgrenzen, L2/L5/L6.

## Architektur-Entscheidung

Das Control Plane entsteht als **normaler Manifest-Layer `packages/studio`**
+ dünne App `apps/studio` (später hawaii.studio) — gebaut mit den eigenen
Werkzeugen der Plattform (create-site, Manifeste, Gates). Vertrauensgrenze
aus § 8 gilt ab Tag 1: Das Register kennt Endpoints/Status/Metadaten der
Sites, aber KEINE Site-Inhalte, keine Site-Sessions, keine Site-Keys
(die kommen erst mit dem getrennten Provisioner-Worker, M7).

## Teilpakete

- **T1 (dieses Paket): Sites-Register + Health.** Table `sites`
  (studio-001: name, slug veränderlich, projectId unveränderlich (F6),
  endpoint, appUrl, Lifecycle-`status` mit den L2/P2-Zuständen,
  healthStatus/healthCheckedAt, notes; Permissions [] — nur Server liest).
  Routen `/api/studio/sites` (CRUD + POST /:id/health: probt
  Appwrite-Health + App-URL → ok/degraded/down) hinter neuer Capability
  `sites.manage`. Dashboard-Seite /dashboard/sites (Liste mit Status-/
  Health-Badges, manuelle Registrierung, Health-Check-Button).
  Deregistrieren entfernt NUR den Register-Eintrag, nie Projekt/Daten.
- **T2: Site-Erstellungs-Flow** — create-site als Job hinter der UI
  (Vorstufe des Provisioner-Vertrags: eng typisierte Jobs, § 8).
- **T3: manuelle Entitlements** (F3-Vorstufe ohne Signatur/Stripe).
- **T4: Health-Automatik** (Intervall-Plugin wie Digest-Sweep) +
  Feature-Snapshot je Site.

## Status T1

Code komplett (Layer + Scaffold `apps/studio`, Port 3004, „15 Layer,
4 Apps — konsistent"). **Provisionierung + Live-Verifikation warten auf
die Erholung der lokalen Appwrite-Instanz** (VM-Thrashing am 2026-07-15/16;
Health-Endpoint antwortet, DB-Operationen hängen → OrbStack-Neustart durch
David empfohlen, mehr VM-RAM für M6/M7-Arbeit ebenfalls). Danach:
`create-site`-Provisionierung nachholen (Projekt fürs Studio), Migration,
photos + reddit-comments registrieren, Health-Checks browser-verifizieren.

Offen aus G2 (parallel geparkt): JWT-Realtime-Verifikation
(/tmp/jwt-test.mjs, läuft in 15 s sobald die Instanz DB-gesund ist).
