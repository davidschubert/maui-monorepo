/**
 * Minimale OKLCH-Farbmathematik (Björn Ottosson, OKLab) — Grundlage des
 * „Perceived"-Ramp-Modus im Theme-Studio: gleichmäßige WAHRGENOMMENE
 * Helligkeitsstufen statt sRGB-Mischung (die helle Stufen auswäscht).
 * Pure Funktionen, ohne Dependency; Gamut-Clipping über Chroma-Reduktion.
 */

export interface Oklch {
  /** Lightness 0..1 */
  l: number
  /** Chroma 0..~0.4 */
  c: number
  /** Hue in Grad 0..360 */
  h: number
}

function srgbToLinear(value: number): number {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

/** [r,g,b] 0..255 → OKLCH */
export function rgbToOklch([r8, g8, b8]: [number, number, number]): Oklch {
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s

  const c = Math.hypot(a, bb)
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c, h }
}

/** OKLCH → [r,g,b] 0..255 — kann außerhalb des sRGB-Gamuts liegen (s. oklchToRgbClamped) */
function oklchToLinearRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180
  const a = Math.cos(rad) * c
  const b = Math.sin(rad) * c

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
}

function inGamut(rgb: [number, number, number]): boolean {
  return rgb.every(v => v >= -0.0001 && v <= 1.0001)
}

/**
 * OKLCH → sRGB-Hex. Liegt die Farbe außerhalb des Gamuts, wird das Chroma
 * per Binärsuche reduziert (Lightness/Hue bleiben — wahrnehmungstreu).
 */
export function oklchToHex(color: Oklch): string {
  let { c } = color
  let rgb = oklchToLinearRgb({ ...color, c })
  if (!inGamut(rgb)) {
    let low = 0
    let high = c
    for (let i = 0; i < 20; i++) {
      c = (low + high) / 2
      rgb = oklchToLinearRgb({ ...color, c })
      if (inGamut(rgb)) low = c
      else high = c
    }
    rgb = oklchToLinearRgb({ ...color, c: low })
  }
  const [r, g, b] = rgb
  const hex = (v: number) => linearToSrgb(v).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
