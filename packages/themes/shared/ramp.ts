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

export interface CustomThemeDto {
  /** Appwrite-Row-ID (data-theme wird `c-<id>`) */
  id: string
  name: string
  /** Basisfarbe (hex, wird zur primary-500) */
  primary: string
  order: number
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

// Mischanteile je Stufe — an den statischen Theme-CSS-Kurven (ocean/forest)
// kalibriert: helle Stufen Richtung Weiß, dunkle Richtung Schwarz.
const LIGHT_STOPS: [Shade, number][] = [[50, 0.95], [100, 0.88], [200, 0.75], [300, 0.55], [400, 0.3]]
const DARK_STOPS: [Shade, number][] = [[600, 0.12], [700, 0.28], [800, 0.42], [900, 0.53], [950, 0.7]]

/** Basisfarbe (hex) → komplette Primary-Ramp 50–950; null bei ungültigem Hex. */
export function generateRamp(primary: string): Record<Shade, string> | null {
  const rgb = hexToRgb(primary)
  if (!rgb) return null
  const ramp = { 500: primary.toLowerCase() } as Record<Shade, string>
  for (const [shade, amount] of LIGHT_STOPS) ramp[shade] = mix(rgb, [255, 255, 255], amount)
  for (const [shade, amount] of DARK_STOPS) ramp[shade] = mix(rgb, [0, 0, 0], amount)
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
export function customThemeCss(theme: CustomThemeDto): string {
  const ramp = generateRamp(theme.primary)
  if (!ramp) return ''
  const attr = customThemeAttr(theme.id)
  const vars = SHADES.map(shade => `  --ui-color-primary-${shade}: ${ramp[shade]};`).join('\n')
  return `:root[data-theme='${attr}'] {\n${vars}\n  --ui-primary: var(--ui-color-primary-600);\n}\n.dark[data-theme='${attr}'] {\n  --ui-primary: var(--ui-color-primary-400);\n}`
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
