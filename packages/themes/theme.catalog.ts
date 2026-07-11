import type { ThemeSpec } from './shared/themeGen'

/**
 * Design-Spezifikation des Theme-Katalogs (Vollausbau-Plan § 4.2; dort als
 * theme.spec.ts angedacht — umbenannt, weil *.spec.ts mit dem Vitest-Include-
 * Pattern kollidiert) — der
 * EINZIGE Input für `pnpm --filter @maui/themes generate`.
 *
 * ⚠️ PLATZHALTER-Stand (Generator-Vorarbeit, 2026-07-11): enthält die 9
 * Bestands-Themes mit ihren heutigen Basis-/Varianten-Farben, damit der
 * Generator gegen Bekanntes abnehmbar ist. Der echte 26×11-Katalog kommt
 * mit den Entscheidungen E1–E7 + Plan-Schritt 2 (Kuratierung durch David) —
 * dann hier NUR Einträge ergänzen/ersetzen, der Generator bleibt unberührt.
 * Der 'default'-Eintrag (file: null) bleibt bewusst außerhalb: er braucht
 * keine CSS-Datei.
 */
export const THEME_CATALOG: ThemeSpec[] = [
  { id: 'ocean', name: 'Ocean', base: '#2f7fee', variants: [
    { id: 'teal', base: '#3be3d5' },
    { id: 'indigo', base: '#6235e9' },
  ] },
  { id: 'forest', name: 'Forest', base: '#51cd85', variants: [
    { id: 'lime', base: '#84d24b' },
    { id: 'moss', base: '#a8c15c' },
  ] },
  { id: 'sunset', name: 'Sunset', base: '#f47e2a', variants: [
    { id: 'rose', base: '#e93562' },
    { id: 'violet', base: '#b640dd' },
  ] },
  { id: 'midnight', name: 'Midnight', base: 'oklch(58.5% 0.233 277.117)', variants: [] },
  { id: 'berry', name: 'Berry', base: 'oklch(66.7% 0.295 322.15)', variants: [] },
  { id: 'crimson', name: 'Crimson', base: 'oklch(64.5% 0.246 16.439)', variants: [] },
  { id: 'citrus', name: 'Citrus', base: 'oklch(76.9% 0.188 70.08)', variants: [] },
  { id: 'graphite', name: 'Graphite', base: 'oklch(55.2% 0.016 285.938)', variants: [] },
]
