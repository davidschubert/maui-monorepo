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
]
