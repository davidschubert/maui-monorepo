# M6 — Control Plane `apps/studio` (Umsetzungsplan)

Stand: 2026-07-17 · Status: **T1–T4 fertig, verifiziert — M6 komplett** (Go David nach Gate G2)
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
admin@studio.local); photos (`photos-qgry`) + comments registriert,
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

## Status T3 — ✅ fertig (2026-07-16, browser-verifiziert)

- **Vertrag** (`shared/types/entitlement.ts`, Migration studio-003): Table
  `entitlements` — Row pro Site×Feature (siteProjectId = F6-Identität,
  featureKey, status, notes; unique site×feature). Row existiert = Feature
  zugeteilt; `status` ist Vorwärts-Kompatibilität für M8 (suspended/Grace).
  Bewusst OHNE Signatur/Plan/Zustellung — das kommt mit M8/Stripe; bis dahin
  ist die Table die manuell gepflegte Wahrheit, und `featureGates.ts` (core)
  behält seinen vorbereiteten Andockpunkt („dritte UND-Bedingung").
- **API:** GET /api/studio/sites liefert `entitlements: string[]` je Site mit;
  PUT /api/studio/sites/:id/entitlements ersetzt das Grant-Set
  (Katalog-validiert, gleiche Nicht-zuteilbar-Regel core/system/studio wie
  T2). Deregistrieren räumt die Entitlement-Rows der Site mit ab
  (Register-seitige Daten — das Site-Projekt bleibt unberührt).
- **Runner-Auto-Grant:** `studio-jobs` teilt einer frisch provisionierten
  Site ihre gewählten Features automatisch zu.
- **UI:** Feature-Chips am Site-Eintrag + „Features"-Modal (Katalog-Checkboxen
  mit requires-Autoselect, geteilt mit dem Neue-Site-Picker).
- **Betriebs-Learnings dieses Pakets:**
  1. `provisioning_jobs` lag am MariaDB-Zeilenbudget — Appwrite prüft die
     Zeilengröße VOR dem Duplikat-Check, ein idempotenter Re-Run bekam 400
     (column_limit_exceeded) statt 409. studio-002 ist jetzt
     inspektionsbasiert idempotent (listColumns) und schrumpft `log` auf
     8000 (Headroom; Runner kürzt auf 7500).
  2. HMR-stale DOM: Klicks auf einen vor dem HMR-Reload gerenderten Dialog
     verpuffen — nach Layer-Edits Seite neu laden, dann UI-Flows testen
     (deckt sich mit dem bekannten Vite/HMR-Muster).

## Status T4 — ✅ fertig (2026-07-17, browser-verifiziert) → M6 KOMPLETT

- **Health-Automatik:** `server/plugins/health-sweep.ts` (Digest-Sweep-Muster:
  setInterval 5 min + Erst-Lauf 15 s nach Boot, unref, Single-Instanz-
  Annahme); Logik geteilt mit der manuellen Route in
  `server/utils/siteHealth.ts` (checkSiteHealth/runHealthSweep). Geloggt wird
  nur bei Änderung oder nicht-ok — das L6-Alerting (E-Mail) dockt später
  genau dort an.
- **Feature-Snapshot je Site:** neue öffentliche Core-Route
  `GET /api/platform/features` (eigener Core-Commit; nur wirksam aktive
  Feature-Keys, Microcache 60 s) — bewusst unauthentifiziert, weil Studio
  nach § 8 keine Site-Keys hält. Der Sweep liest sie von erreichbaren Apps
  und persistiert das Array in `sites.features` (studio-004); ein
  fehlgeschlagener Abruf löscht den letzten bekannten Snapshot nicht.
- **UI:** „Läuft:"-Chipzeile je Site (implizite Keys core/system/studio
  ausgeblendet); läuft ein Feature OHNE Entitlement, warnt der Chip
  (orange) — der eigentliche Kontroll-Wert des Snapshots. Verifiziert:
  photos deckungsgleich (neutral), comments mit Warn-Chips für die
  einkompilierten, aber nicht zugeteilten Features.

## Nach M6 (Roadmap)

M7 (Provisioner-Worker + ploi/Cloudflare) braucht PHASE-17-Infrastruktur;
vorher bieten sich M5/P3 `apps/portfolio` (Scope-Frage an David offen) oder
P2-Polish photos an. Entitlement-ZUSTELLUNG an die Sites (signiertes
Dokument, dritte UND-Bedingung in featureGates) ist M8.

## M8-Vorbereitung — ✅ Zustellung steht (2026-07-17, e2e-verifiziert)

Die signierte Entitlement-Zustellung ist gebaut (P2-Polish und M6 waren
vorher fertig); M8 selbst muss nur noch Stripe/Workspaces/Pläne anschließen:

- **Dokument** (core `entitlementDocument.ts`, 20 Unit-Tests): Ed25519,
  `base64url(payload).base64url(sig)`, kid-Rotation, Clock-Skew ±5 min,
  validUntil/graceUntil/suspended nach § F3 (Signatur wird IMMER geprüft;
  Grace toleriert nur fachlichen Ablauf; jenseits graceUntil bzw. bei
  suspended degradiert optional-Tier auf AUS; foundation nie geschaltet).
- **Aussteller** (studio): `GET /api/platform/entitlements/:projectId`
  (öffentlich, Microcache 60 s; features aus den Grant-Rows, suspended aus
  sites.status; 503 ohne Signier-Schlüssel). Keys: `pnpm entitlements:keygen`
  — privater Schlüssel NUR im Studio, kid→Public-Key-Map in den Site-Envs.
- **Site-Seite** (core): entitlements-pull-Plugin (15 min + Erst-Lauf;
  no-op ohne NUXT_ENTITLEMENTS_URL) + POST /api/platform/entitlements/refresh
  (system.manage); nur VERIFIZIERTE Dokumente landen in
  app_config.entitlements (system-019). featureGates: Registry ∧
  app_config.features ∧ Entitlement — kein Dokument = neutral AN
  (Einführungssicherheit), unverifizierbares Dokument = optional-Tier AUS.
- **E2E-Beweis (photos):** Boot-Pull persistierte das Dokument automatisch;
  media-Grant im Studio entzogen → Pull → `/api/media` 404 + Snapshot ohne
  media; Re-Grant → 200. Der Kreis Studio-Grant → signiertes Dokument →
  wirksames Gate ist geschlossen.
- **Stolperfalle dokumentiert:** Nitro destr-t Env-Werte —
  `NUXT_ENTITLEMENTS_PUBLIC_KEYS='{"k1":…}'` kommt als OBJEKT in der
  runtimeConfig an; `parseEntitlementPublicKeys()` akzeptiert beide Formen.
