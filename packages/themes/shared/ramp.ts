import { oklchToHex, rgbToOklch } from './oklch'

/**
 * Runtime-Ramp-Generator für CUSTOM Themes (Theme-Studio).
 *
 * Die 9 mitgelieferten Themes bleiben statisch generierte CSS-Dateien
 * (public/themes/*, kein Runtime-Anteil). Eigene, im Admin angelegte Themes
 * brauchen dagegen eine Ramp aus EINER Basisfarbe — dieser Generator mischt
 * die 500er-Basis mit Weiß (helle Stufen) bzw. Schwarz (dunkle Stufen) in
 * sRGB. Pure Funktionen, unit-getestet; das CSS wird SSR-seitig in den Head
 * gerendert (kein Flash).
 */

/** Generator-Parameter eines Custom Themes (Editor-Regler, alle optional) */
export interface ThemeConfig {
  /** 'perceived' = OKLCH-Stufen (Default) · 'linear' = sRGB-Mischung (v1) */
  mode?: 'perceived' | 'linear'
  /** Stufe, auf der die Basisfarbe EXAKT liegt; 'auto' = nächstliegende Helligkeit */
  anchor?: 'auto' | Shade
  /** Hue-Drift in Grad über die Ramp (am Anker 0, zu den Enden hin voll) */
  hueShift?: number
  /** Chroma-Multiplikator (1 = neutral, 0..2) */
  saturation?: number
  /** Wahrgenommene Helligkeit der 50er-Stufe in % (Default 97) */
  lightnessMax?: number
  /** Wahrgenommene Helligkeit der 950er-Stufe in % (Default 16) */
  lightnessMin?: number
  /** --ui-radius in rem (überschreibt den Default des aktiven Basis-Themes) */
  radius?: number
  /** 'tinted' = Neutral-Ramp aus dem Primary-Hue ableiten (brand-getönte Flächen) */
  neutral?: 'tinted'
  /** Primary-Stufe für --ui-primary im Dark-Mode (Default 400) */
  darkAlias?: 300 | 400 | 500
  /** Text-Schrift (FONT_FAMILY_REGISTRY-Id oder 'cf-<id>') — ohne = App-Font.
   *  v1-Paar-Ids (editorial …) werden beim Laden gemappt (LEGACY_FONT_PAIRS). */
  font?: string
  /** Überschriften-Schrift (h1–h6) — ohne = wie Text */
  fontHeading?: string
  /** Überschriften-Gewicht (überschreibt Komponenten-Utilities; ohne = Default) */
  headingWeight?: 400 | 500 | 600 | 700 | 800
  /** Überschriften-Laufweite in px (-3..6; 0/ohne = Default) */
  headingTracking?: number
  /** true = Überschriften in Großbuchstaben */
  headingUppercase?: boolean
}

/** Farbvariante eines Custom Themes (data-variant überschreibt die Primary-Ramp) */
export interface CustomVariant {
  id: string
  color: string
}

export interface CustomThemeDto {
  /** Appwrite-Row-ID (data-theme wird `c-<id>`) */
  id: string
  name: string
  /** Basisfarbe (hex, liegt auf der Anker-Stufe) */
  primary: string
  order: number
  config?: ThemeConfig
  variants?: CustomVariant[]
}

/** Instanz-weite Theme-Einstellungen (app_config.themeSettings) */
export interface ThemeSettings {
  /** Theme für Besucher ohne Cookie (Built-in-Id oder 'c-<rowId>') */
  defaultThemeId?: string
  /** Variante des Default-Themes für Besucher ohne Cookie (optional) */
  defaultVariantId?: string
  /** Overrides je Built-in: umbenennen / ausblenden / umsortieren */
  builtins?: Record<string, { name?: string, hidden?: boolean, order?: number }>
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Shade = typeof SHADES[number]

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return null
  return [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16)]
}

function toHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')
}

/** base mit target mischen: amount 0 = base, 1 = target */
function mix(base: [number, number, number], target: [number, number, number], amount: number): string {
  return `#${toHex(base[0] + (target[0] - base[0]) * amount)}${toHex(base[1] + (target[1] - base[1]) * amount)}${toHex(base[2] + (target[2] - base[2]) * amount)}`
}

// Mischanteile je Stufe (Modus 'linear', v1) — an den statischen Theme-CSS-
// Kurven kalibriert: helle Stufen Richtung Weiß, dunkle Richtung Schwarz.
const LIGHT_STOPS: [Shade, number][] = [[50, 0.95], [100, 0.88], [200, 0.75], [300, 0.55], [400, 0.3]]
const DARK_STOPS: [Shade, number][] = [[600, 0.12], [700, 0.28], [800, 0.42], [900, 0.53], [950, 0.7]]

function generateLinearRamp(primary: string): Record<Shade, string> | null {
  const rgb = hexToRgb(primary)
  if (!rgb) return null
  const ramp = { 500: primary.toLowerCase() } as Record<Shade, string>
  for (const [shade, amount] of LIGHT_STOPS) ramp[shade] = mix(rgb, [255, 255, 255], amount)
  for (const [shade, amount] of DARK_STOPS) ramp[shade] = mix(rgb, [0, 0, 0], amount)
  return ramp
}

// 'Perceived': OKLCH-Lightness-Ziele je Stufe (an Tailwind-v4-Ramps kalibriert,
// normiert 0..1 zwischen lightnessMax und lightnessMin) und Chroma-Kurve
// (Sättigung läuft an den hellen/dunklen Enden zurück, Maximum um 400–600).
const L_CURVE = [1, 0.93, 0.845, 0.72, 0.58, 0.475, 0.375, 0.28, 0.195, 0.115, 0]
const C_CURVE = [0.22, 0.42, 0.62, 0.82, 0.97, 1, 0.97, 0.88, 0.76, 0.62, 0.45]

function generatePerceivedRamp(primary: string, config: ThemeConfig): Record<Shade, string> | null {
  const rgb = hexToRgb(primary)
  if (!rgb) return null
  const base = rgbToOklch(rgb)

  const lMax = (config.lightnessMax ?? 97) / 100
  const lMin = (config.lightnessMin ?? 16) / 100
  const targetL = L_CURVE.map(t => lMin + (lMax - lMin) * t)

  // Anker: Stufe, auf der die Basisfarbe EXAKT bleibt — 'auto' = nächstes L
  const anchorIndex = config.anchor && config.anchor !== 'auto'
    ? SHADES.indexOf(config.anchor)
    : targetL.reduce((best, l, i) => (Math.abs(l - base.l) < Math.abs(targetL[best]! - base.l) ? i : best), 0)

  const saturation = config.saturation ?? 1
  const hueShift = config.hueShift ?? 0
  const anchorC = C_CURVE[anchorIndex]!
  const maxDistance = Math.max(anchorIndex, SHADES.length - 1 - anchorIndex) || 1

  // Die Basisfarbe liegt selten EXAKT auf der Stufen-Helligkeit — die Kurve
  // wird um die Abweichung verschoben, zu den Enden hin auslaufend (Taper):
  // Anker bleibt exakt, die Ramp bleibt glatt und monoton.
  const anchorDelta = base.l - targetL[anchorIndex]!

  const ramp = {} as Record<Shade, string>
  SHADES.forEach((shade, i) => {
    if (i === anchorIndex) {
      ramp[shade] = primary.toLowerCase()
      return
    }
    // Chroma relativ zur Anker-Kurve skalieren (Anker behält sein Chroma exakt);
    // Hue driftet linear mit der Distanz zum Anker (am Anker 0).
    const distance = (i - anchorIndex) / maxDistance
    ramp[shade] = oklchToHex({
      l: targetL[i]! + anchorDelta * (1 - Math.abs(distance)),
      c: base.c * (C_CURVE[i]! / anchorC) * saturation,
      h: (base.h + hueShift * distance + 360) % 360,
    })
  })
  return ramp
}

/** Basisfarbe (hex) + Konfiguration → komplette Primary-Ramp 50–950; null bei ungültigem Hex. */
export function generateRamp(primary: string, config: ThemeConfig = {}): Record<Shade, string> | null {
  return (config.mode ?? 'perceived') === 'linear'
    ? generateLinearRamp(primary)
    : generatePerceivedRamp(primary, config)
}

// Tinted Neutral: L/C-Kurven der mist-Ramp (kalibriert, siehe neutral.css) —
// nur der Hue kommt aus der Primary. Fixe, flache Chroma-Werte: der Tint
// bleibt subtil, egal wie gesättigt die Markenfarbe ist.
const NEUTRAL_L = [0.987, 0.963, 0.925, 0.872, 0.723, 0.56, 0.45, 0.378, 0.275, 0.218, 0.148]
const NEUTRAL_C = [0.002, 0.002, 0.005, 0.007, 0.014, 0.021, 0.017, 0.015, 0.011, 0.008, 0.004]

/** Brand-getönte Neutral-Ramp aus dem Hue der Basisfarbe; null bei ungültigem Hex. */
export function generateNeutralRamp(primary: string): Record<Shade, string> | null {
  const rgb = hexToRgb(primary)
  if (!rgb) return null
  const hue = rgbToOklch(rgb).h
  const ramp = {} as Record<Shade, string>
  SHADES.forEach((shade, i) => {
    ramp[shade] = oklchToHex({ l: NEUTRAL_L[i]!, c: NEUTRAL_C[i]!, h: hue })
  })
  return ramp
}

/** data-theme-Attributwert eines Custom Themes (kollidiert nie mit Built-ins) */
export function customThemeAttr(id: string): string {
  return `c-${id}`
}

/**
 * CSS-Block eines Custom Themes — gleiche Struktur wie die statischen Themes
 * (Ramp + --ui-primary 600 hell / 400 dunkel). Die Werte sind validierte
 * Hex-Farben aus generateRamp, die IDs Appwrite-Row-IDs — keine Injection-Fläche.
 */
export function customThemeCss(theme: CustomThemeDto, attrOverride?: string): string {
  const config = theme.config ?? {}
  const ramp = generateRamp(theme.primary, config)
  if (!ramp) return ''
  const attr = attrOverride ?? customThemeAttr(theme.id)
  const vars = SHADES.map(shade => `  --ui-color-primary-${shade}: ${ramp[shade]};`).join('\n')
  // radius nur mit validiertem Zahlwert übernehmen (Zod begrenzt zusätzlich)
  const radius = typeof config.radius === 'number' && Number.isFinite(config.radius)
    ? `\n  --ui-radius: ${config.radius}rem;`
    : ''
  // Dark-Stufe: welcher Ramp-Wert im Dark-Mode --ui-primary stellt (Feintuning
  // gegen zu grelle/zu matte Primaries; nur validierte Literale)
  const darkAlias = config.darkAlias === 300 || config.darkAlias === 500 ? config.darkAlias : 400
  const blocks = [
    `:root[data-theme='${attr}'] {\n${vars}\n  --ui-primary: var(--ui-color-primary-600);${radius}\n}`,
    `.dark[data-theme='${attr}'] {\n  --ui-primary: var(--ui-color-primary-${darkAlias});\n}`,
  ]
  // Varianten: eigene Ramp aus der Varianten-Farbe (gleiche Generator-Config)
  for (const variant of theme.variants ?? []) {
    const variantRamp = generateRamp(variant.color, config)
    if (!variantRamp) continue
    const variantVars = SHADES.map(shade => `  --ui-color-primary-${shade}: ${variantRamp[shade]};`).join('\n')
    blocks.push(`:root[data-theme='${attr}'][data-variant='${variant.id}'] {\n${variantVars}\n}`)
  }
  // Überschriften-Feintuning: EIN h1–h6-Block je Theme. Der Style ist
  // unlayered und gewinnt damit gegen Tailwind-Utilities (@layer utilities) —
  // Werte nur nach Validierung (Literale/Range), keine Injection-Fläche.
  const headingRules: string[] = []
  if ([400, 500, 600, 700, 800].includes(config.headingWeight as number)) {
    headingRules.push(`  font-weight: ${config.headingWeight};`)
  }
  if (typeof config.headingTracking === 'number' && Number.isFinite(config.headingTracking)
    && config.headingTracking !== 0 && config.headingTracking >= -3 && config.headingTracking <= 6) {
    headingRules.push(`  letter-spacing: ${config.headingTracking}px;`)
  }
  if (config.headingUppercase === true) {
    headingRules.push('  text-transform: uppercase;')
  }
  if (headingRules.length) {
    const selectors = [1, 2, 3, 4, 5, 6].map(level => `:root[data-theme='${attr}'] h${level}`).join(',\n')
    blocks.push(`${selectors} {\n${headingRules.join('\n')}\n}`)
  }
  // Tinted Neutral: eigener data-neutral-Block (gleiche Selektor-Form wie
  // neutral.css) — angewendet nur, wenn data-neutral auf dem Theme steht
  if (config.neutral === 'tinted') {
    const neutralRamp = generateNeutralRamp(theme.primary)
    if (neutralRamp) {
      const neutralVars = SHADES.map(shade => `  --ui-color-neutral-${shade}: ${neutralRamp[shade]};`).join('\n')
      blocks.push(`:root[data-neutral='${attr}'] {\n${neutralVars}\n}`)
    }
  }
  return blocks.join('\n')
}

// ── Kontrast (WCAG 2.x) ──────────────────────────────────────────────────

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(rgb: [number, number, number]): number {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2])
}

/** WCAG-Kontrastverhältnis 1..21 zwischen zwei Hex-Farben; null bei ungültigem Hex. */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return null
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [light, dark] = la >= lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/** 'AAA' (≥7) | 'AA' (≥4.5) | 'AA18' (≥3, nur große Schrift) | 'fail' */
export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'AA18' | 'fail' {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA18'
  return 'fail'
}
