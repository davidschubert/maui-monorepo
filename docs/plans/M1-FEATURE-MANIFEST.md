# M1 — Feature-Manifest + Site-Manifest + CI-Check (Umsetzungsplan)

Stand: 2026-07-14 · Status: **zur Abnahme** (Paket-Prinzip: erst Go, dann Bau)
Kontext: [MULTI-SITE-PLATFORM-STRATEGIE.md](MULTI-SITE-PLATFORM-STRATEGIE.md)
F1 · Gate S0 ✅ bestanden — die Vertrags-Formen sind validiert.

## Ziel

Eine maschinenlesbare Single Source of Truth, WELCHE Features es gibt und
WELCHE eine Site nutzt — und ein CI-Check, der die heutige Doppelpflege
(`extends` + `package.json`, leicht divergierbar) beendet. M1 ändert KEIN
Laufzeitverhalten: beide Apps laufen unverändert, nur eben manifest-geprüft.

**Nicht in M1:** Laufzeit-Gates/Statusmaschine (M2), Katalog-UI (M2/F7),
Katalog-Artefakt-Publishing (M6), Codegen beim Scaffolding (M4).

## Design-Entscheidungen (bitte abnicken oder kippen)

- **E1 — Check statt Codegen:** `extends`/`package.json` bleiben
  handgeschrieben; das Script VALIDIERT sie gegen die Manifeste (rot bei
  Abweichung). Weniger Magie, kein Build-Schritt; Codegen kommt erst mit
  `create-site` (M4). 
- **E2 — Pflicht-Fundament in M1 = nur `core` + `system`.** Die weiteren
  foundation-Layer (admin, themes, billing, später pages) sind
  Katalog-Semantik („bei Platform-Sites immer an"), werden aber für
  Studio-Sites NICHT erzwungen — Beleg: `_template` extended heute bewusst
  kein billing. Erzwingen würde M1 zum Umbau-Paket machen.
- **E3 — `moderation` bleibt eigenes Manifest** mit tier `optional`, wird
  aber via `requires` von comments/posts automatisch mitgezogen (Katalog
  zeigt später „aktiviert automatisch: Moderation").

## Bauplan

### P1 — Typen + Schema (packages/core) · ~0,5 PT

- `packages/core/shared/types/manifest.ts`: `FeatureManifest` +
  `SiteManifest` (TypeScript-Typen; Layer nutzen `satisfies`).
- `packages/core/shared/manifestSchema.ts`: Zod-Schemas (Laufzeit-Validierung
  im Check-Script; Zod ist Core-Dependency).
- Felder `FeatureManifest` (M1-Umfang):
  ```ts
  {
    key: string                 // === Ordnername packages/<key>
    tier: 'foundation' | 'optional'
    requires?: string[]         // Feature-Keys (Abhängigkeits-Schluss geprüft)
    hasMigrations: boolean      // gegen scripts/migrations/ abgeglichen
    entitlementKey?: string     // Default = key (für F3, ab M6 genutzt)
    title: { en: string, de: string }        // Katalog-Vorstufe (F7)
    description: { en: string, de: string }
    icon?: string               // z. B. 'i-ph-chat-circle'
  }
  ```
  Titel/Beschreibung liegen IM Manifest (en+de, Sprachen-Regel), nicht in
  Layer-Locales — das Control Plane liest Manifeste später ohne Nuxt-Kontext.
- `SiteManifest`: `{ siteId: string, features: string[] }` — core+system
  implizit, nie gelistet.

### P2 — 13 Feature-Manifeste · ~0,5 PT

`packages/<layer>/feature.manifest.ts` mit
`export default { … } satisfies FeatureManifest` (type-only-Import aus core
— zur Laufzeit erased, Node-`--experimental-strip-types`-kompatibel, gleiches
Verfahren wie bootstrap.ts).

Tier-Zuordnung: **foundation** = core, system, admin, themes, billing ·
**optional** = comments, posts, events, activity, feedback, courses, tickets,
moderation. `requires` initial: comments→moderation, posts→moderation —
weitere ergeben sich beim Schreiben aus den realen Layer-Verträgen (werden
im PR einzeln begründet).

### P3 — 2 Site-Manifeste · ~0,25 PT

- `apps/reddit-comments/site.manifest.ts` (alle 11 Feature-Layer)
- `apps/_template/site.manifest.ts` (themes, admin, comments, moderation)

### P4 — Check-Script + CI · ~1 PT

`scripts/check-manifests.mjs` (Muster/Ton wie `scripts/migrate.mjs`),
Root-Script `pnpm check:manifests`, CI-Step in **lint.yml** (schnellster
Workflow). Prüfungen:

1. Jeder Layer unter `packages/` hat ein Zod-valides Manifest; `key` ===
   Ordnername; Keys eindeutig.
2. Jede App unter `apps/` (inkl. `_template`) hat ein valides Site-Manifest;
   alle referenzierten Features existieren; `requires`-Schluss erfüllt
   (comments ohne moderation → rot).
3. **Konsistenz `extends`:** Menge = Manifest-Features + core + system;
   Reihenfolge folgt der kanonischen `EXTENDS_ORDER` (eine Konstante im
   Script, abgeleitet aus der heutigen reddit-comments-Reihenfolge;
   früher = höhere Priorität, core/system am Ende).
4. **Konsistenz `package.json`:** `@maui/*`-Dependencies = exakt dieselbe
   Menge (fehlend ODER überzählig → rot).
5. `hasMigrations` ⇔ `scripts/migrations/` existiert, und **Drift-Check
   gegen `LAYER_ORDER` in migrate.mjs**: jeder Layer mit Migrationen muss
   dort vorkommen (vergessenes Eintragen fällt sofort auf).

Fehlerausgabe wie beim Migrations-Runner: pro Verstoß eine Zeile mit
Datei + erwartet/ist — kein Stacktrace-Rätsel.

### P5 — Doku · ~0,25 PT

CLAUDE.md (Kurzregel: „neuer Layer ⇒ feature.manifest.ts; Feature-Wahl der
App ⇒ site.manifest.ts, check:manifests hält extends/package.json ehrlich")
+ CONCEPT.md-Verweis + README-Status-Zeile (Goal-Abschluss-Routine).

## Akzeptanzkriterien (Definition of Done)

1. `pnpm check:manifests` grün auf main.
2. **Negativproben rot** (je einmal demonstriert): Feature aus `extends`
   entfernt · `@maui/comments` aus package.json entfernt · moderation aus
   site.manifest gestrichen während comments drin ist · Layer ohne Manifest.
3. `pnpm typecheck` grün; `pnpm -r test` grün; reddit-comments bootet lokal
   (Smoke) — Verhalten unverändert.
4. CI-Lauf (lint.yml) enthält den Check und ist grün.

## Risiken / Grenzen

- `--experimental-strip-types` lädt kein `satisfies` mit Nicht-Type-Import →
  strikt `import type` in Manifesten (Check-Script erzwingt das per Grep).
- `feed` extended reddit-comments heute evtl. mit Sonderreihenfolge —
  EXTENDS_ORDER wird beim Bau aus dem IST abgeleitet, nicht erfunden;
  falls das IST inkonsistent ist, entscheidet der PR explizit.
- Kein Laufzeit-Import der Manifeste in M1 (kein Nuxt-Modul nötig) — die
  Laufzeit-Anbindung kommt mit M2 (Gates) bzw. M6 (Katalog-Artefakt).

## Reihenfolge & Aufwand

P1 → P2 → P3 → P4 → P5, zusammen ~2,5 PT. Ein PR/Commit-Paket pro P-Schritt
(Core-Änderung P1 in eigenem Commit, Konvention). Check-in nach P4 mit
Demo der Negativproben.
