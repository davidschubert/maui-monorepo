import { SHADES, type Shade, generateRamp, contrastRatio, HEX_COLOR_RE } from './ramp'
import { oklchToHex } from './oklch'

/**
 * Pure Generator-Logik für den Theme-Katalog (Vollausbau-Plan Schritt 3):
 * ThemeSpec → CSS im Format der Bestands-Themes (public/themes/*.css) +
 * Registry-Einträge. Ohne Nuxt-/Node-Deps → unit-testbar; der CLI-Wrapper
 * (scripts/generate-themes.ts) macht nur I/O. Deterministisch: gleicher
 * Input ⇒ byte-gleicher Output.
 */

export interface ThemeSpecVariant {
  id: string
  base: string
}

export interface ThemeSpec {
  id: string
  name: string
  /** Basisfarbe: '#rrggbb' oder 'oklch(58.5% 0.233 277.117)' */
  base: string
  /** Varianten (Katalog-Ziel: exakt 10 — bis E1–E7 entschieden sind, frei) */
  variants: ThemeSpecVariant[]
  /** Default '0.375rem' (wie Bestands-Themes) */
  radius?: string
}

export interface GeneratedTheme {
  id: string
  css: string
  /** primary-500 der Basis-Ramp (Registry-Chip) */
  color: string
  variants: { id: string, color: string }[]
  /** Kontrast-Gate-Verschiebungen (z. B. 'ocean: light 600→700') — fürs Log */
  adjustments: string[]
}

// Kontrast-Gate (Plan Schritt 4, Basisstufe): --ui-primary muss als UI-
// Komponenten-Farbe WCAG 1.4.11 (≥ 3:1) gegen den jeweiligen Seitengrund
// bestehen. Näherungen der Nuxt-UI-Defaults: light bg weiß, dark bg neutral-900.
const LIGHT_BG = '#ffffff'
const DARK_BG = '#171717'
const MIN_RATIO = 3
const LIGHT_CANDIDATES: Shade[] = [600, 700, 800]
const DARK_CANDIDATES: Shade[] = [400, 300, 200]

/** 'oklch(58.5% 0.233 277.117)' | '#rrggbb' → '#rrggbb' (klein); null = ungültig */
export function specColorToHex(value: string): string | null {
  if (HEX_COLOR_RE.test(value)) return value.toLowerCase()
  const match = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value.trim())
  if (!match) return null
  return oklchToHex({ l: Number(match[1]) / 100, c: Number(match[2]), h: Number(match[3]) })
}

function pickPrimaryShade(
  ramp: Record<Shade, string>,
  candidates: Shade[],
  background: string,
): Shade | null {
  for (const shade of candidates) {
    const ratio = contrastRatio(ramp[shade], background)
    if (ratio !== null && ratio >= MIN_RATIO) return shade
  }
  return null
}

function rampBlock(ramp: Record<Shade, string>, indent = '  '): string {
  return SHADES.map(shade => `${indent}--ui-color-primary-${shade}: ${ramp[shade]};`).join('\n')
}

/** Ein Theme (Basis + Varianten) → CSS-Datei-Inhalt + Registry-Daten. */
export function generateTheme(spec: ThemeSpec): GeneratedTheme {
  const baseHex = specColorToHex(spec.base)
  if (!baseHex) throw new Error(`Theme '${spec.id}': ungültige Basisfarbe '${spec.base}'`)
  const baseRamp = generateRamp(baseHex)
  if (!baseRamp) throw new Error(`Theme '${spec.id}': Ramp-Generierung fehlgeschlagen`)

  const adjustments: string[] = []
  const lightShade = pickPrimaryShade(baseRamp, LIGHT_CANDIDATES, LIGHT_BG)
  const darkShade = pickPrimaryShade(baseRamp, DARK_CANDIDATES, DARK_BG)
  if (!lightShade || !darkShade) {
    throw new Error(`Theme '${spec.id}': Kontrast-Gate nicht erfüllbar (light=${lightShade}, dark=${darkShade}) — Basisfarbe anpassen`)
  }
  if (lightShade !== 600) adjustments.push(`${spec.id}: light 600→${lightShade}`)
  if (darkShade !== 400) adjustments.push(`${spec.id}: dark 400→${darkShade}`)

  const parts: string[] = [
    `/* Maui Theme: ${spec.id} — GENERIERT von scripts/generate-themes.ts, nicht von Hand editieren */`,
    '',
    `:root[data-theme='${spec.id}'] {`,
    rampBlock(baseRamp),
    `  --ui-primary: var(--ui-color-primary-${lightShade});`,
    `  --ui-radius: ${spec.radius ?? '0.375rem'};`,
    `}`,
    '',
    `.dark[data-theme='${spec.id}'] {`,
    `  --ui-primary: var(--ui-color-primary-${darkShade});`,
    `}`,
  ]

  const variants: GeneratedTheme['variants'] = []
  for (const variant of spec.variants) {
    const variantHex = specColorToHex(variant.base)
    if (!variantHex) throw new Error(`Theme '${spec.id}', Variante '${variant.id}': ungültige Farbe '${variant.base}'`)
    const variantRamp = generateRamp(variantHex)
    if (!variantRamp) throw new Error(`Theme '${spec.id}', Variante '${variant.id}': Ramp fehlgeschlagen`)

    const vLight = pickPrimaryShade(variantRamp, LIGHT_CANDIDATES, LIGHT_BG)
    const vDark = pickPrimaryShade(variantRamp, DARK_CANDIDATES, DARK_BG)
    if (!vLight || !vDark) {
      throw new Error(`Theme '${spec.id}', Variante '${variant.id}': Kontrast-Gate nicht erfüllbar`)
    }

    parts.push(
      '',
      `/* Farbvariation via CSS-Variablen: data-variant überschreibt die Primary-Ramp */`,
      '',
      `:root[data-theme='${spec.id}'][data-variant='${variant.id}'] {`,
      rampBlock(variantRamp),
      // Nur abweichende Stufen überschreiben — Basis-Block liefert den Default
      ...(vLight !== lightShade ? [`  --ui-primary: var(--ui-color-primary-${vLight});`] : []),
      `}`,
      ...(vDark !== darkShade
        ? ['', `.dark[data-theme='${spec.id}'][data-variant='${variant.id}'] {`, `  --ui-primary: var(--ui-color-primary-${vDark});`, `}`]
        : []),
    )
    if (vLight !== 600) adjustments.push(`${spec.id}/${variant.id}: light 600→${vLight}`)
    if (vDark !== 400) adjustments.push(`${spec.id}/${variant.id}: dark 400→${vDark}`)

    variants.push({ id: variant.id, color: variantRamp[500] })
  }

  return {
    id: spec.id,
    css: `${parts.join('\n')}\n`,
    color: baseRamp[500],
    variants,
    adjustments,
  }
}

/** Registry-Modul (themeRegistry.gen.ts) aus den generierten Themes. */
export function buildRegistryModule(themes: GeneratedTheme[], specs: ThemeSpec[]): string {
  const nameById = new Map(specs.map(spec => [spec.id, spec.name]))
  const entries = themes.map((theme) => {
    const variants = theme.variants.map(v => `    { id: '${v.id}', color: '${v.color}' },`).join('\n')
    return [
      `  { id: '${theme.id}', name: '${nameById.get(theme.id)}', file: '/themes/${theme.id}.css', color: '${theme.color}', variants: [`,
      ...(variants ? [variants] : []),
      `  ] },`,
    ].join('\n')
  }).join('\n')
  return [
    `// GENERIERT von scripts/generate-themes.ts aus theme.spec.ts — nicht von Hand editieren.`,
    `// Handgepflegt bleiben: default-Eintrag, NEUTRAL_REGISTRY, Typen (themeRegistry.ts).`,
    `import type { MauiTheme } from './themeRegistry'`,
    ``,
    `export const GENERATED_THEMES: MauiTheme[] = [`,
    entries,
    `]`,
    ``,
  ].join('\n')
}
