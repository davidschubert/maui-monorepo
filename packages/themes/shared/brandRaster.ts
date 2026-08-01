/**
 * Die Zeichen-Werkzeuge der Bildmarken-Bilder — server-only (node:zlib für den
 * Atlas).
 *
 * Warum als eigenes Modul: es gibt inzwischen ZWEI erzeugte Bilder je
 * Community — die Vorschau-Karte für geteilte Links (brandCardPng.ts,
 * 1200×630) und das App-Icon für den Home-Bildschirm (brandIconPng.ts,
 * quadratisch). Beide brauchen dieselbe Fläche, dieselbe Mischung, denselben
 * gebackenen Zeichensatz. Zweimal nachgebaut wären sie genau die Art Kopie,
 * die später auseinanderläuft — dieselbe Begründung, aus der schon
 * `resolveTenantBrandMark()` EINE Auflösung für Favicon und Karte ist.
 *
 * Alles hier ist Arithmetik über einen Byte-Puffer: keine neue Abhängigkeit,
 * kein natives Binary im Deploy. Gerastert hat Chrome EINMAL
 * (scripts/generate-brand-card-font.mjs → brandCardFont.gen.ts), hier werden
 * die Zeichen nur noch zusammengesetzt.
 */
import { gunzipSync } from 'node:zlib'
import { hexToRgb } from './ramp'
import { BRAND_MARK_FALLBACK_COLOR } from './brandMark'
import type { BrandCardFont, BrandCardGlyph } from './brandCard'

export type Rgb = [number, number, number]

/** Entpackte Deckungs-Bytes des Atlas — einmal je Prozess, danach geteilt. */
let atlasPixels: Uint8Array | null = null
export function fontPixels(font: BrandCardFont): Uint8Array {
  if (!atlasPixels) atlasPixels = new Uint8Array(gunzipSync(Buffer.from(font.pixels, 'base64')))
  return atlasPixels
}

export function toRgb(hex: string): Rgb {
  const rgb = hexToRgb(hex) ?? hexToRgb(BRAND_MARK_FALLBACK_COLOR)
  return (rgb ?? [115, 115, 115]) as Rgb
}

/** Zeichenfläche: RGB, 3 Bytes je Pixel, zeilenweise (wie PNG sie will). */
export interface Surface {
  width: number
  height: number
  data: Uint8Array
}

export function createSurface(width: number, height: number): Surface {
  return { width, height, data: new Uint8Array(width * height * 3) }
}

/** Ein Pixel mit Deckung `alpha` (0..1) übermalen. */
export function blend(surface: Surface, x: number, y: number, color: Rgb, alpha: number): void {
  if (alpha <= 0 || x < 0 || y < 0 || x >= surface.width || y >= surface.height) return
  const i = (y * surface.width + x) * 3
  const a = alpha >= 1 ? 1 : alpha
  const data = surface.data
  data[i] = Math.round(color[0] * a + data[i]! * (1 - a))
  data[i + 1] = Math.round(color[1] * a + data[i + 1]! * (1 - a))
  data[i + 2] = Math.round(color[2] * a + data[i + 2]! * (1 - a))
}

/** Die ganze Fläche in einer Farbe (schneller als fillRect über alles). */
export function fillSurface(surface: Surface, color: Rgb): void {
  const { data } = surface
  for (let i = 0; i < data.length; i += 3) {
    data[i] = color[0]
    data[i + 1] = color[1]
    data[i + 2] = color[2]
  }
}

/** Kreis mit weichem Rand (Deckung aus dem Abstand zur Kante). */
export function fillCircle(surface: Surface, cx: number, cy: number, r: number, color: Rgb, alpha = 1): void {
  const from = Math.max(0, Math.floor(cy - r - 1))
  const to = Math.min(surface.height - 1, Math.ceil(cy + r + 1))
  for (let y = from; y <= to; y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 1)); x <= Math.min(surface.width - 1, Math.ceil(cx + r + 1)); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      // 1 px Übergang statt harter Kante — sonst sieht der Kreis gezackt aus
      const coverage = Math.min(1, Math.max(0, r + 0.5 - d))
      if (coverage > 0) blend(surface, x, y, color, coverage * alpha)
    }
  }
}

export function fillRect(surface: Surface, x: number, y: number, w: number, h: number, color: Rgb, alpha = 1): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) blend(surface, px, py, color, alpha)
  }
}

export interface Coverage {
  data: Uint8Array
  width: number
  height: number
}

/**
 * Verkleinern heißt bei einer Deckungsmaske flächenmitteln, und das ist nicht
 * bloß „gut genug", sondern die richtige Rechnung: der Mittelwert der
 * Teilflächen IST die Deckung des größeren Pixels (Supersampling).
 */
function downscale(src: Coverage, scale: number): Coverage {
  const w = Math.max(1, Math.round(src.width * scale))
  const h = Math.max(1, Math.round(src.height * scale))
  const out = new Uint8Array(w * h)
  const fx = src.width / w
  const fy = src.height / h
  for (let y = 0; y < h; y++) {
    const y0 = y * fy
    const y1 = y0 + fy
    for (let x = 0; x < w; x++) {
      const x0 = x * fx
      const x1 = x0 + fx
      let sum = 0
      let weight = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          const weightXy = wx * wy
          sum += src.data[sy * src.width + sx]! * weightXy
          weight += weightXy
        }
      }
      out[y * w + x] = weight > 0 ? Math.round(sum / weight) : 0
    }
  }
  return { data: out, width: w, height: h }
}

/**
 * Vergrößern — für das App-Icon (brandIconPng.ts) nötig, für die Karte nie.
 *
 * Der Atlas ist bei 72 px gebacken; ein Icon mit 512 px Kantenlänge will die
 * Initiale bei ~280 px. Bilinear allein ergäbe eine ~4 px breite, matschige
 * Kante — der Verlauf der Originalkante wird schlicht mitgezogen. Deshalb
 * danach ein Steilerstellen der Deckung UM 0,5 herum: die 0,5-Linie ist die
 * Kontur des Zeichens und bleibt, wo sie ist (der Buchstabe wird also weder
 * fetter noch dünner), nur der Übergang schrumpft wieder auf gut ein Pixel.
 *
 * Höchstens Faktor 2, und das ist nachgemessen: mit 2,7 (scale/1,6) bekamen
 * Rundungen — das „C" von „Citrusverein" — eine sichtbare Welle. Steiler
 * gestellt wird nämlich nicht nur die Kante, sondern auch die Ungenauigkeit,
 * mit der die 72-px-Vorlage sie überhaupt kennt. Etwas weicher und glatt
 * schlägt scharf und wellig, zumal die Kachel nie in voller Größe erscheint:
 * 512 px liefert ein Gerät auf 120 bis 192 px herunter.
 */
function upscale(src: Coverage, scale: number): Coverage {
  const w = Math.max(1, Math.round(src.width * scale))
  const h = Math.max(1, Math.round(src.height * scale))
  const out = new Uint8Array(w * h)
  const fx = src.width / w
  const fy = src.height / h
  const steep = Math.min(2, Math.max(1, scale / 2.4))
  for (let y = 0; y < h; y++) {
    // Mitte des Zielpixels in Quell-Koordinaten
    const sy = (y + 0.5) * fy - 0.5
    const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(sy)))
    const y1 = Math.min(src.height - 1, y0 + 1)
    const wy = Math.max(0, Math.min(1, sy - y0))
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5) * fx - 0.5
      const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(sx)))
      const x1 = Math.min(src.width - 1, x0 + 1)
      const wx = Math.max(0, Math.min(1, sx - x0))
      const top = src.data[y0 * src.width + x0]! * (1 - wx) + src.data[y0 * src.width + x1]! * wx
      const bottom = src.data[y1 * src.width + x0]! * (1 - wx) + src.data[y1 * src.width + x1]! * wx
      const value = (top * (1 - wy) + bottom * wy) / 255
      const sharpened = (value - 0.5) * steep + 0.5
      out[y * w + x] = Math.round(Math.min(1, Math.max(0, sharpened)) * 255)
    }
  }
  return { data: out, width: w, height: h }
}

/** Eine Glyphe auf Zielgröße bringen (beide Richtungen). */
export function resampleCoverage(src: Coverage, scale: number): Coverage {
  if (src.width === 0 || src.height === 0) return src
  if (scale > 0.999 && scale < 1.001) return src
  return scale < 1 ? downscale(src, scale) : upscale(src, scale)
}

/** Zeichensatz-Zugriff mit Größen-Cache je Bild (dieselbe Glyphe wiederholt sich). */
export class GlyphCache {
  private readonly cache = new Map<string, Coverage>()
  constructor(private readonly font: BrandCardFont, private readonly bytes: Uint8Array) {}

  glyph(ch: string): BrandCardGlyph | undefined {
    return this.font.glyphs[ch]
  }

  coverage(ch: string, scale: number): Coverage | null {
    const glyph = this.glyph(ch)
    if (!glyph || glyph.w === 0) return null
    const key = `${ch}|${scale.toFixed(4)}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const source: Coverage = {
      data: this.bytes.subarray(glyph.o, glyph.o + glyph.w * glyph.h),
      width: glyph.w,
      height: glyph.h,
    }
    const scaled = resampleCoverage(source, scale)
    this.cache.set(key, scaled)
    return scaled
  }
}

export function drawCoverage(surface: Surface, cov: Coverage, x: number, y: number, color: Rgb, alpha: number): void {
  for (let cy = 0; cy < cov.height; cy++) {
    for (let cx = 0; cx < cov.width; cx++) {
      const value = cov.data[cy * cov.width + cx]!
      if (value > 0) blend(surface, x + cx, y + cy, color, (value / 255) * alpha)
    }
  }
}

export interface TextOptions {
  size: number
  color: Rgb
  alpha?: number
  tracking?: number
}

/** Eine Zeile Text an der Grundlinie `baseline` ab `x` setzen. */
export function drawText(
  surface: Surface,
  cache: GlyphCache,
  font: BrandCardFont,
  text: string,
  x: number,
  baseline: number,
  { size, color, alpha = 1, tracking = 0 }: TextOptions,
): void {
  const scale = size / font.size
  let pen = x
  for (const ch of text) {
    const glyph = cache.glyph(ch)
    if (!glyph) continue
    const cov = cache.coverage(ch, scale)
    if (cov) {
      drawCoverage(
        surface,
        cov,
        Math.round(pen + glyph.l * scale),
        Math.round(baseline + glyph.t * scale),
        color,
        alpha,
      )
    }
    pen += glyph.a * scale + tracking
  }
}

/**
 * Zeichen mittig in einen Punkt setzen (Initiale in der Marke).
 *
 * Mittig heißt hier über die BITMAP, nicht über die Schriftmaße: ein „J" hat
 * eine tiefe Unterlänge und ein „T" keine — an der Grundlinie ausgerichtet
 * säße das eine sichtbar zu hoch, das andere zu tief. Optisch zentriert ist,
 * was auch aussieht wie zentriert.
 */
export function drawGlyphCentered(
  surface: Surface,
  cache: GlyphCache,
  font: BrandCardFont,
  ch: string,
  cx: number,
  cy: number,
  size: number,
  color: Rgb,
): void {
  const glyph = cache.glyph(ch)
  const cov = glyph ? cache.coverage(ch, size / font.size) : null
  if (!glyph || !cov) return
  drawCoverage(
    surface,
    cov,
    Math.round(cx - cov.width / 2),
    Math.round(cy - cov.height / 2),
    color,
    1,
  )
}
