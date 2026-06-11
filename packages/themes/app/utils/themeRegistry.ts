export interface MauiTheme {
  id: string
  name: string
  /** null = Core-Default (keine zusätzliche CSS-Datei) */
  file: string | null
  /** Farbvariationen — überschreiben die Primary-Ramp via data-variant */
  variants: string[]
}

export const DEFAULT_THEME_ID = 'default'

export const THEME_REGISTRY: MauiTheme[] = [
  { id: DEFAULT_THEME_ID, name: 'Maui', file: null, variants: [] },
  { id: 'ocean', name: 'Ocean', file: '/themes/ocean.css', variants: ['teal', 'indigo'] },
  { id: 'forest', name: 'Forest', file: '/themes/forest.css', variants: ['lime', 'moss'] },
  { id: 'sunset', name: 'Sunset', file: '/themes/sunset.css', variants: ['rose', 'violet'] },
]
