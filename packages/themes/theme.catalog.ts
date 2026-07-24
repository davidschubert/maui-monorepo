import type { ThemeSpec, ThemeSpecVariant } from './shared/themeGen'
import { hexToRgb } from './shared/ramp'
import { rgbToOklch, type Oklch } from './shared/oklch'

/**
 * Design-Spezifikation des Theme-Katalogs (Vollausbau-Plan § 4.2; dort als
 * theme.spec.ts angedacht — umbenannt, weil *.spec.ts mit dem Vitest-Include-
 * Pattern kollidiert) — der EINZIGE Input für
 * `pnpm --filter @maui/themes generate`.
 *
 * KURATIERTER 26×11-KATALOG (Entscheidungen E1–E7, 2026-07-23):
 *  - E1(b): `default` (Maui, monochrom) zählt NICHT — 26 echte Farbwelten.
 *  - E2(a): 11 Farbvariationen = Basis + 10 `data-variant`-Overrides.
 *  - E4: Hue-Raster über den oklch-Kreis als STARTPUNKT (21 chromatische
 *    Welten, ~17° Abstand), dann kuratiert + benannt; dazu 5 kuratierte
 *    Ausreißer (graphite, espresso, sage, plum, steel — gedeckte Töne, die
 *    ein reines Raster nie hergibt).
 *  - E5(a): rein farblich (Radius bleibt Default, keine Fonts).
 *
 * Varianten-System: ein EINHEITLICHES tonales Schema (soft/muted/vivid/deep/
 * bright/warm/cool/dawn/dusk/pastel) — jede Farbwelt bietet dieselben
 * Stellungen, die Matrix bleibt vergleichbar und die Namen tragen Bedeutung
 * statt Farbwillkür. Ausnahmen: ocean/forest/sunset behalten ihre zwei
 * handkuratierten Bestands-Varianten als erste Einträge (Plan Schritt 2);
 * graphite ist quasi-achromatisch (Chroma-/Hue-Töne wirkungslos) und bekommt
 * handkuratierte Material-Tönungen.
 *
 * Die Tonwerte werden deterministisch aus der Basisfarbe abgeleitet (pure
 * oklch-Mathematik, gleicher Input = gleicher Output) — das Kontrast-Gate im
 * Generator bleibt die Qualitätsschranke.
 */

// ── Tonales Varianten-Schema ────────────────────────────────────────────────

function parseBase(value: string): Oklch {
  const rgb = hexToRgb(value)
  if (rgb) return rgbToOklch(rgb)
  const match = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value.trim())
  if (!match) throw new Error(`Katalog: ungültige Basisfarbe '${value}'`)
  return { l: Number(match[1]) / 100, c: Number(match[2]), h: Number(match[3]) }
}

function fmt({ l, c, h }: Oklch): string {
  const hue = ((h % 360) + 360) % 360
  return `oklch(${(Math.min(Math.max(l, 0.2), 0.88) * 100).toFixed(1)}% ${Math.min(Math.max(c, 0), 0.33).toFixed(3)} ${hue.toFixed(1)})`
}

const TONES: [string, (o: Oklch) => Oklch][] = [
  ['soft', o => ({ ...o, c: o.c * 0.55 })],
  ['muted', o => ({ ...o, c: o.c * 0.32 })],
  // vivid: satter UND einen Hauch tiefer — bei bereits gamut-maximalen Basen
  // (crimson, berry) klemmt das Chroma zurück, die Tiefe hält die Variante
  // trotzdem unterscheidbar von der Basis.
  ['vivid', o => ({ ...o, c: o.c * 1.35, l: o.l - 0.04 })],
  ['deep', o => ({ ...o, l: o.l - 0.1 })],
  ['bright', o => ({ ...o, l: o.l + 0.08 })],
  ['warm', o => ({ ...o, h: o.h + 18 })],
  ['cool', o => ({ ...o, h: o.h - 18 })],
  ['dawn', o => ({ ...o, h: o.h - 36, l: o.l + 0.04 })],
  ['dusk', o => ({ ...o, h: o.h + 36, l: o.l - 0.06 })],
  ['pastel', o => ({ ...o, c: o.c * 0.45, l: o.l + 0.1 })],
]

/** Die 10 tonalen Varianten einer Basisfarbe (bzw. die ersten `count`). */
function tones(base: string, count = 10): ThemeSpecVariant[] {
  const parsed = parseBase(base)
  return TONES.slice(0, count).map(([id, tone]) => ({ id, base: fmt(tone(parsed)) }))
}

// ── Katalog: 26 Farbwelten ──────────────────────────────────────────────────

export const THEME_CATALOG: ThemeSpec[] = [
  // 21 chromatische Welten über den oklch-Hue-Kreis (Bestands-Basen exakt
  // beibehalten; Reihenfolge = Hue-Position, beginnend bei Rot)
  { id: 'crimson', name: 'Crimson', base: 'oklch(64.5% 0.246 16.439)', variants: tones('oklch(64.5% 0.246 16.439)') },
  { id: 'coral', name: 'Coral', base: 'oklch(66% 0.19 33)', variants: tones('oklch(66% 0.19 33)') },
  { id: 'sunset', name: 'Sunset', base: '#f47e2a', variants: [
    { id: 'rose', base: '#e93562' },
    { id: 'violet', base: '#b640dd' },
    ...tones('#f47e2a', 8),
  ] },
  { id: 'citrus', name: 'Citrus', base: 'oklch(76.9% 0.188 70.08)', variants: tones('oklch(76.9% 0.188 70.08)') },
  { id: 'honey', name: 'Honey', base: 'oklch(75% 0.16 90)', variants: tones('oklch(75% 0.16 90)') },
  { id: 'meadow', name: 'Meadow', base: 'oklch(72% 0.19 112)', variants: tones('oklch(72% 0.19 112)') },
  { id: 'spring', name: 'Spring', base: 'oklch(70% 0.21 133)', variants: tones('oklch(70% 0.21 133)') },
  { id: 'forest', name: 'Forest', base: '#51cd85', variants: [
    { id: 'lime', base: '#84d24b' },
    { id: 'moss', base: '#a8c15c' },
    ...tones('#51cd85', 8),
  ] },
  { id: 'jade', name: 'Jade', base: 'oklch(68% 0.15 172)', variants: tones('oklch(68% 0.15 172)') },
  { id: 'lagoon', name: 'Lagoon', base: 'oklch(70% 0.14 188)', variants: tones('oklch(70% 0.14 188)') },
  { id: 'reef', name: 'Reef', base: 'oklch(68% 0.13 204)', variants: tones('oklch(68% 0.13 204)') },
  { id: 'arctic', name: 'Arctic', base: 'oklch(70% 0.13 220)', variants: tones('oklch(70% 0.13 220)') },
  { id: 'azure', name: 'Azure', base: 'oklch(65% 0.15 235)', variants: tones('oklch(65% 0.15 235)') },
  { id: 'denim', name: 'Denim', base: 'oklch(58% 0.17 250)', variants: tones('oklch(58% 0.17 250)') },
  { id: 'ocean', name: 'Ocean', base: '#2f7fee', variants: [
    { id: 'teal', base: '#3be3d5' },
    { id: 'indigo', base: '#6235e9' },
    ...tones('#2f7fee', 8),
  ] },
  { id: 'midnight', name: 'Midnight', base: 'oklch(58.5% 0.233 277.117)', variants: tones('oklch(58.5% 0.233 277.117)') },
  { id: 'amethyst', name: 'Amethyst', base: 'oklch(60% 0.22 293)', variants: tones('oklch(60% 0.22 293)') },
  { id: 'orchid', name: 'Orchid', base: 'oklch(63% 0.23 308)', variants: tones('oklch(63% 0.23 308)') },
  { id: 'berry', name: 'Berry', base: 'oklch(66.7% 0.295 322.15)', variants: tones('oklch(66.7% 0.295 322.15)') },
  { id: 'blossom', name: 'Blossom', base: 'oklch(66% 0.24 339)', variants: tones('oklch(66% 0.24 339)') },
  { id: 'flamingo', name: 'Flamingo', base: 'oklch(65% 0.22 355)', variants: tones('oklch(65% 0.22 355)') },

  // 5 kuratierte Ausreißer — gedeckte, „materielle" Töne
  { id: 'graphite', name: 'Graphite', base: 'oklch(55.2% 0.016 285.938)', variants: [
    // quasi-achromatisch: handkuratierte Material-Tönungen statt Ton-Schema
    { id: 'ink', base: 'oklch(45% 0.045 270)' },
    { id: 'pewter', base: 'oklch(58% 0.035 220)' },
    { id: 'iron', base: 'oklch(50% 0.02 60)' },
    { id: 'carbon', base: 'oklch(40% 0.012 286)' },
    { id: 'silver', base: 'oklch(66% 0.012 286)' },
    { id: 'smoke', base: 'oklch(62% 0.025 300)' },
    { id: 'ash', base: 'oklch(60% 0.02 100)' },
    { id: 'charcoal', base: 'oklch(35% 0.015 286)' },
    { id: 'mineral', base: 'oklch(52% 0.05 200)' },
    { id: 'umber', base: 'oklch(46% 0.04 40)' },
  ] },
  { id: 'espresso', name: 'Espresso', base: 'oklch(45% 0.06 55)', variants: tones('oklch(45% 0.06 55)') },
  { id: 'sage', name: 'Sage', base: 'oklch(62% 0.06 150)', variants: tones('oklch(62% 0.06 150)') },
  { id: 'plum', name: 'Plum', base: 'oklch(48% 0.09 320)', variants: tones('oklch(48% 0.09 320)') },
  { id: 'steel', name: 'Steel', base: 'oklch(56% 0.06 250)', variants: tones('oklch(56% 0.06 250)') },
]
