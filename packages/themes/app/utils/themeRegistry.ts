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

/** Kuratiertes Schriftpaar (data-font) — Familien sind in fonts.css deklariert,
 *  @nuxt/fonts self-hostet sie automatisch (build-bekannt, kein Runtime-CDN). */
export interface MauiFontPair {
  /** data-font Wert */
  id: string
  /** Anzeigename (Font-Namen, kein i18n nötig) */
  label: string
}

// Bewusst kuratiert statt freier Font-Wahl: maximal Text + Überschrift pro
// Paar (+ fixe Mono) — mehr als 3 Schriften pro Seite sind ausgeschlossen.
// Kein Eintrag 'default': ohne data-font gilt der App-Font (Core: Geist).
export const FONT_PAIR_REGISTRY: MauiFontPair[] = [
  { id: 'inter', label: 'Inter' },
  { id: 'humanist', label: 'Source Sans' },
  { id: 'editorial', label: 'Source Sans + Source Serif' },
  { id: 'geometric', label: 'Nunito Sans + Sora' },
  { id: 'classic', label: 'PT Sans + PT Serif' },
]

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

// Farben = primary-500 aus den jeweiligen public/themes/*.css (Default = neutral,
// da das Maui-Theme monochrom ist: --ui-primary black/white).
export const THEME_REGISTRY: MauiTheme[] = [
  { id: DEFAULT_THEME_ID, name: 'Maui', file: null, color: '#737373', variants: [] },
  { id: 'ocean', name: 'Ocean', file: '/themes/ocean.css', color: '#2f7fee', variants: [
    { id: 'teal', color: '#3be3d5' },
    { id: 'indigo', color: '#6235e9' },
  ] },
  { id: 'forest', name: 'Forest', file: '/themes/forest.css', color: '#51cd85', variants: [
    { id: 'lime', color: '#84d24b' },
    { id: 'moss', color: '#a8c15c' },
  ] },
  { id: 'sunset', name: 'Sunset', file: '/themes/sunset.css', color: '#f47e2a', variants: [
    { id: 'rose', color: '#e93562' },
    { id: 'violet', color: '#b640dd' },
  ] },
  // Tailwind-v4-Paletten (oklch-Ramps generiert aus tailwindcss/theme.css)
  { id: 'midnight', name: 'Midnight', file: '/themes/midnight.css', color: 'oklch(58.5% 0.233 277.117)', variants: [] },
  { id: 'berry', name: 'Berry', file: '/themes/berry.css', color: 'oklch(66.7% 0.295 322.15)', variants: [] },
  { id: 'crimson', name: 'Crimson', file: '/themes/crimson.css', color: 'oklch(64.5% 0.246 16.439)', variants: [] },
  { id: 'citrus', name: 'Citrus', file: '/themes/citrus.css', color: 'oklch(76.9% 0.188 70.08)', variants: [] },
  { id: 'graphite', name: 'Graphite', file: '/themes/graphite.css', color: 'oklch(55.2% 0.016 285.938)', variants: [] },
]
