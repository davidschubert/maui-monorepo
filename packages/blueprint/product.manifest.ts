import type { ProductManifest } from '../core/shared/types/manifest'

/**
 * KOMPOSITIONS-LAYER (Davids „Bauplan", 2026-07-27 — docs/referenz/PRODUKT-BILANZ.md).
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
 *  - Kompositionen für events/courses sind am 2026-07-31 hierher gezogen
 *    (OPEN-ITEMS C3): beide Produkte sind durch die Datentür gegangen und in
 *    apps/platform montiert — die Vorbedingung aus Bilanz-Schritt 3 ist damit
 *    erfüllt. Vorher lagen Event+Kommentare und Lektion+Kommentare nur in
 *    apps/comments; der Pool zeigte dieselben Seiten ohne Kommentare.
 *
 * `requires` wächst mit den Kompositionen: wer den Bauplan wählt, wählt auch
 * die Produkte, die er verdrahtet — sonst registriert er Seiten für Layer,
 * die gar nicht da sind. `pnpm check:manifests` erzwingt den Schluss.
 */
export default {
  key: 'blueprint',
  tier: 'foundation',
  requires: ['posts', 'comments', 'events', 'courses'],
  hasMigrations: false,
  title: { en: 'Blueprint', de: 'Bauplan' },
  description: {
    en: 'Composition layer: wires the products together (feed + comments, …) exactly once, so pool and silo sites behave identically.',
    de: 'Kompositions-Layer: verdrahtet die Produkte genau einmal (Feed + Kommentare, …), damit Pool- und Silo-Sites identisch funktionieren.',
  },
  icon: 'i-ph-blueprint',
} satisfies ProductManifest
