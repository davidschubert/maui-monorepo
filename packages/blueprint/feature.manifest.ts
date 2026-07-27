import type { FeatureManifest } from '../core/shared/types/manifest'

/**
 * KOMPOSITIONS-LAYER (Davids „Bauplan", 2026-07-27 — docs/plans/PRODUKT-BILANZ.md).
 *
 * Einziger Layer, der mehrere PRODUKT-Layer kennen DARF: sein ganzer Zweck
 * ist das Zusammenstecken (A14-Komposition), das vorher App-Sache war und
 * dadurch je App auseinanderlief (comments-App hatte Feed+Kommentare,
 * platform nicht — dasselbe Produkt, zwei Ausprägungen).
 *
 * Regeln:
 *  - Hier liegen NUR Kompositionen (Slot-Füllungen, geteilte Seiten-Overrides),
 *    NIE Produkt-Logik, NIE eigene Tables, NIE server/api.
 *  - In `extends` steht blueprint VOR den Produkt-Layern (höhere Priorität),
 *    damit seine Seiten die „nackten" Produkt-Seiten überlagern.
 *  - Kompositionen für events/courses ziehen erst hierher um, wenn diese
 *    Produkte durch die Datentür gegangen und im Pool montiert sind
 *    (bis dahin bleiben sie in apps/comments — Bilanz-Reihenfolge Schritt 3).
 */
export default {
  key: 'blueprint',
  tier: 'foundation',
  requires: ['posts', 'comments'],
  hasMigrations: false,
  title: { en: 'Blueprint', de: 'Bauplan' },
  description: {
    en: 'Composition layer: wires the products together (feed + comments, …) exactly once, so pool and silo sites behave identically.',
    de: 'Kompositions-Layer: verdrahtet die Produkte genau einmal (Feed + Kommentare, …), damit Pool- und Silo-Sites identisch funktionieren.',
  },
  icon: 'i-ph-blueprint',
} satisfies FeatureManifest
