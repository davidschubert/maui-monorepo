# M6 — Control Plane `apps/studio` (Umsetzungsplan)

Stand: 2026-07-16 · Status: **T1 + T2 fertig, verifiziert** (Go David nach Gate G2)
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

## Status T1 — ✅ fertig (2026-07-16, browser-verifiziert)

Studio provisioniert (Projekt `studio-1xsl`, Port 3004, Admin
admin@studio.local); photos (`photos-qgry`) + reddit-comments registriert,
Health-Checks beide „ok". Der geparkte G2-JWT-Befund ist aufgeklärt
(spikes/s3-minimal/README, Befund 1).

## Status T2 — ✅ fertig (2026-07-16, e2e-verifiziert)

- **Vertrag** (`packages/studio/shared/types/job.ts`, Migration studio-002):
  Table `provisioning_jobs` (type/payload/status/log/result/requestedBy/
  runnerId, queued→running→done/error) + Table `feature_catalog`
  (rowId = Feature-Key; Katalog-Texte aus den Manifesten). Beide ohne
  Client-Permissions.
- **§-8-Schnitt:** Der Web-Prozess BESCHREIBT Jobs nur (POST /api/studio/jobs,
  Frühvalidierung gegen den Katalog: wählbar = alles außer core/system/studio,
  requires-Schluss, Duplikat-Checks). Ausgeführt wird repo-seitig von
  `pnpm studio:jobs [--watch]` (scripts/studio-jobs.mjs): synct den
  Feature-Katalog aus packages/*/feature.manifest.ts, claimt die Queue und
  spawnt create-site mit den Console-Credentials des Operators; Log/Result
  landen am Job, die fertige Site im Register. Der M7-Provisioner-Worker
  übernimmt denselben Vertrag.
- **UI:** „Neue Site"-Dialog (Name + Feature-Picker aus dem Katalog mit
  requires-Autoselect) + Provisionierungs-Liste mit Status-Badges und
  aufklappbarem Log; Polling nur solange Jobs offen sind.
- **E2E-Abnahme:** Job `t2-probe` über die UI angelegt → Runner provisionierte
  Projekt `t2-probe-4etm` (Scaffold, Keys, Platform, Bootstrap, Register-
  Eintrag) → UI zeigte done + Log. Probe danach rückstandsfrei entfernt
  (Projekt gelöscht, apps/ + Lockfile zurückgesetzt, Register-Eintrag raus;
  Job-Row bleibt als Historie).
