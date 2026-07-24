import { GENERATED_THEMES } from './themeRegistry.gen'

export interface MauiVariant {
  /** data-variant Wert (überschreibt die Primary-Ramp) */
  id: string
  /** Echte Variant-Farbe (primary-500 aus der Theme-CSS) — für den Chip-Punkt */
  color: string
}

export interface MauiTheme {
  id: string
  name: string
  /** null = Core-Default (keine zusätzliche CSS-Datei) */
  file: string | null
  /** Basis-Farbe des Themes (primary-500) — für den Chip-Punkt im Theme-Select */
  color: string
  /** Farbvariationen — überschreiben die Primary-Ramp via data-variant */
  variants: MauiVariant[]
}

export const DEFAULT_THEME_ID = 'default'

/** Eine wählbare Neutral-Palette (überschreibt die --ui-color-neutral-Ramp via data-neutral) */
export interface MauiNeutral {
  /** data-neutral Wert + Nuxt-UI-Palettenname (Tinted: 'c-<rowId>' des Themes) */
  id: string
  /** neutral-500 der Palette — für den Swatch-Punkt */
  color: string
  /** true = brand-getönte Ramp des aktiven Custom Themes (Label via i18n) */
  tinted?: boolean
}

export const DEFAULT_NEUTRAL_ID = 'mist'

/** Kuratierte Schriftfamilie (data-font / data-font-heading) — Familien sind
 *  in fonts.css deklariert, @nuxt/fonts self-hostet sie automatisch
 *  (build-bekannt, kein Runtime-CDN). */
export interface MauiFontFamily {
  /** data-font-/data-font-heading-Wert */
  id: string
  /** Anzeigename (Font-Name, kein i18n nötig) */
  label: string
}

// Zwei Rollen (Text + Überschriften) aus kuratierten Einzelfamilien statt
// fester Paare — maximal 2 wählbare Schriften pro Theme (+ fixe Mono), mehr
// als 3 Schriften pro Seite sind strukturell ausgeschlossen.
// Kein Eintrag 'default': ohne data-font gilt der App-Font (Core: Geist).
export const FONT_FAMILY_REGISTRY: MauiFontFamily[] = [
  { id: 'inter', label: 'Inter' },
  { id: 'source-sans', label: 'Source Sans' },
  { id: 'source-serif', label: 'Source Serif' },
  { id: 'nunito-sans', label: 'Nunito Sans' },
  { id: 'sora', label: 'Sora' },
  { id: 'pt-sans', label: 'PT Sans' },
  { id: 'pt-serif', label: 'PT Serif' },
]

// v1-Schriftpaare (config.font 'editorial' …) → Familien-Rollen. Bestehende
// Configs und Import-Dateien bleiben gültig; gespeichert wird nur noch die
// neue Form.
export const LEGACY_FONT_PAIRS: Record<string, { font: string, fontHeading?: string }> = {
  inter: { font: 'inter' },
  humanist: { font: 'source-sans' },
  editorial: { font: 'source-sans', fontHeading: 'source-serif' },
  geometric: { font: 'nunito-sans', fontHeading: 'sora' },
  classic: { font: 'pt-sans', fontHeading: 'pt-serif' },
}

/** Font-Rollen einer Theme-Config auflösen (inkl. Legacy-Paar-Mapping) */
export function resolveThemeFonts(config?: { font?: string, fontHeading?: string }): { font?: string, fontHeading?: string } {
  const legacy = config?.font ? LEGACY_FONT_PAIRS[config.font] : undefined
  if (legacy) return { font: legacy.font, fontHeading: config?.fontHeading ?? legacy.fontHeading }
  return { font: config?.font, fontHeading: config?.fontHeading }
}

// Reihenfolge: erst die achromatischen/Tailwind-Grautöne, dann die getönten
// Nuxt-UI-v4-Paletten. color = neutral-500 (siehe public/themes/neutral.css).
export const NEUTRAL_REGISTRY: MauiNeutral[] = [
  { id: 'neutral', color: 'oklch(55.6% 0 0)' },
  { id: 'slate', color: 'oklch(55.4% 0.046 257.417)' },
  { id: 'gray', color: 'oklch(55.1% 0.027 264.364)' },
  { id: 'zinc', color: 'oklch(55.2% 0.016 285.938)' },
  { id: 'stone', color: 'oklch(55.3% 0.013 58.071)' },
  { id: 'mist', color: 'oklch(56% 0.021 213.5)' },
  { id: 'taupe', color: 'oklch(54.7% 0.021 43.1)' },
  { id: 'mauve', color: 'oklch(54.2% 0.034 322.5)' },
  { id: 'olive', color: 'oklch(58% 0.031 107.3)' },
]

// 26×11-Vollausbau (Katalog: theme.catalog.ts, Generator: scripts/
// generate-themes.ts): die generierten Themes kommen aus themeRegistry.gen.ts
// (committet, CI prüft „Regenerieren erzeugt kein Diff" — E6a). Handgepflegt
// bleiben hier nur der default-Eintrag (Core-Zustand ohne CSS-Datei) und die
// NEUTRAL_REGISTRY (separate Achse, E3a).
export const THEME_REGISTRY: MauiTheme[] = [
  { id: DEFAULT_THEME_ID, name: 'Maui', file: null, color: '#737373', variants: [] },
  ...GENERATED_THEMES,
]
