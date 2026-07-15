# M2 — Laufzeit-Feature-Gates + Feature-Seite im Admin (Umsetzungsplan)

Stand: 2026-07-14 · Status: **in Umsetzung** (Go David: „mach einfach weiter")
Kontext: Strategie F2/F7 · Baut auf M1 (Manifeste) + S0 auf.

## Ziel

Features einer Site zur LAUFZEIT schalten — Toggle im Dashboard, wirkt ohne
Deploy, Enforcement server-seitig, Daten bleiben. Das verallgemeinert das
`getEffectiveAiConfig`-Muster (Build-Default < DB-Override) von einem
KI-Feld auf jedes Feature.

## Design

1. **Manifest-Registry (Laufzeit):** Jeder Feature-Layer registriert sein
   Manifest per Nitro-Plugin beim Core (`registerFeatureManifest` — gleiches
   Vertragsmuster wie registerUserDataContributor). Das Manifest-FILE bleibt
   `import type`-only; das PLUGIN macht den Wert-Import.
2. **Manifest-Erweiterung:** optionales Feld `apiPrefixes: string[]`
   (z. B. `['/api/activity']`) — Grundlage für zentrales Enforcement.
3. **Effektive Auflösung (F2-Kette, M2-Ausbaustufe):**
   `enabled(key) = kompiliert (Registry) ∧ app_config.features[key].enabled
   ≠ false` — Default AN (kompiliert = von der Site gewollt), DB schaltet ab.
   Entitlements (F3) docken ab M6/M8 als dritte UND-Bedingung an.
4. **Statusmaschine (F2) vorbereitet:** `features`-JSON speichert
   `{ enabled, status }`; M2 nutzt `active`/`inactive` — `provisioning`/
   `error` folgen mit Provisioner (M3/M7), das Schema trägt sie schon.
5. **Zentrales Enforcement statt Routen-Sweep:** EINE Core-Server-Middleware
   matcht Request-Pfade gegen die `apiPrefixes` der Registry → Feature aus
   ⇒ 404 (kein Leak, ob das Feature existiert). Kein Anfassen einzelner
   Feature-Routen nötig. Die bestehenden Flags (commentsEnabled etc.)
   behalten ihre EIGENE Semantik (Schreib-Erlaubnis ≠ Feature an/aus).
6. **Client:** `useFeature(key)` reaktiv über den bestehenden
   Realtime-Config-Kanal (app_config-Row-Update → Refetch, ohne Reload).
   UI blendet aus; Autorität bleibt die Middleware.
7. **Admin-Seite `/dashboard/admin/features`** (admin-Layer, Capability
   `system.manage`): Karten aus der Registry (Icon, Titel/Beschreibung
   en/de aus dem Manifest, Tier-Badge, requires-Hinweis) + Toggle.
   Foundation-Tier ist in M2 NICHT schaltbar (Grundgerüst; verhindert auch
   Admin-Lockout). requires-Logik: Abschalten eines Features, das andere
   brauchen (moderation ← comments), wird verweigert.
8. **Persistenz:** system-Migration 018 — `app_config.features`
   (Varchar 4000, JSON). PATCH über neue Admin-Route mit Audit.

## Arbeitspakete

- **W1 (core):** Registry + `getEffectiveFeatures(event)` +
  `requireFeature`/Middleware + `useFeature()` + Manifest-Typ/Schema um
  `apiPrefixes` erweitern
- **W2 (system):** Migration 018 `app_config.features`
- **W3 (Layer):** 13 Registrier-Plugins + `apiPrefixes` in den Manifesten
- **W4 (admin):** Features-Seite + Routen (GET/PATCH) + Nav + i18n (de/en)
- **W5:** Live-Verifikation (Toggle activity aus → /api/activity 404 + Nav
  weg, ohne Reload; wieder an → alles da) + Doku + Commits

## Bewusst NICHT in M2

Entitlement-Anbindung (M6/M8) · Migrations-Trigger beim Aktivieren (M3:
additiv-sicher-Audit zuerst) · Preis-Badges/Screenshots im Katalog (F7-Ausbau)
· Konsolidierung der Legacy-Flags (eigene Semantik, bleibt).
