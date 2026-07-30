/**
 * Die Bildmarken-Karte einer Community ZEICHNEN (og:image, 1200×630 PNG) —
 * server-only (node:zlib über pngEncode.ts und für das Atlas).
 *
 * SVG oder PNG? PNG, ohne Wahlmöglichkeit: Facebook, WhatsApp und LinkedIn
 * ignorieren ein SVG als og:image vollständig (WhatsApp akzeptiert nur
 * JPG/PNG/WebP). Das Favicon darf SVG sein — die Vorschau-Karte nicht.
 *
 * Und wie rastern, ohne einen Renderer auf die Maschine zu holen? Chrome hat
 * die Zeichen EINMAL gerastert (scripts/generate-brand-card-font.mjs →
 * brandCardFont.gen.ts); hier werden sie nur noch zusammengesetzt und
 * gemischt. Das ist reine Arithmetik über einen Byte-Puffer: keine neue
 * Abhängigkeit, kein natives Binary im Deploy, ~35 ms für ein Bild, das je
 * Community EINMAL entsteht und danach von Platte kommt
 * (apps/platform/server/utils/brandCardStore.ts).
 *
 * Was bewusst NICHT drauf ist: das Logo/Bild des Kunden (es gibt kein
 * Upload-Feld — mögliche Ergänzung später), Mitgliederzahlen oder sonstige
 * Zahlen (sie veralten im Cache der Vorschau-Dienste) und jede Form von
 * Pukalani-Bildsprache außer der kleinen Wortmarke: die Karte soll nach der
 * COMMUNITY aussehen, nicht nach uns.
 */
import { gunzipSync } from 'node:zlib'
import { hexToRgb } from './ramp'
import { brandInkColor, BRAND_MARK_FALLBACK_COLOR } from './brandMark'
import {
  BRAND_CARD_HEIGHT,
  BRAND_CARD_LAYOUT,
  BRAND_CARD_WIDTH,
  layoutBrandCardTitle,
  measureBrandCardText,
  sanitizeBrandCardText,
  type BrandCardFont,
  type BrandCardGlyph,
} from './brandCard'
import { BRAND_CARD_FONT } from './brandCardFont.gen'
import { encodePngRgb } from './pngEncode'

type Rgb = [number, number, number]

/** Entpackte Deckungs-Bytes des Atlas — einmal je Prozess, danach geteilt. */
let atlasPixels: Uint8Array | null = null
function pixels(font: BrandCardFont): Uint8Array {
  if (!atlasPixels) atlasPixels = new Uint8Array(gunzipSync(Buffer.from(font.pixels, 'base64')))
  return atlasPixels
}

function toRgb(hex: string): Rgb {
  const rgb = hexToRgb(hex) ?? hexToRgb(BRAND_MARK_FALLBACK_COLOR)
  return (rgb ?? [115, 115, 115]) as Rgb
}

/** Zeichenfläche: RGB, 3 Bytes je Pixel, zeilenweise (wie PNG sie will). */
interface Surface {
  width: number
  height: number
  data: Uint8Array
}

/** Ein Pixel mit Deckung `alpha` (0..1) übermalen. */
function blend(surface: Surface, x: number, y: number, color: Rgb, alpha: number): void {
  if (alpha <= 0 || x < 0 || y < 0 || x >= surface.width || y >= surface.height) return
  const i = (y * surface.width + x) * 3
  const a = alpha >= 1 ? 1 : alpha
  const data = surface.data
  data[i] = Math.round(color[0] * a + data[i]! * (1 - a))
  data[i + 1] = Math.round(color[1] * a + data[i + 1]! * (1 - a))
  data[i + 2] = Math.round(color[2] * a + data[i + 2]! * (1 - a))
}

/**
 * Der Hintergrund: die Basisfarbe des Themes, zur unteren rechten Ecke hin
 * abgedunkelt, mit einem weichen Lichtschein oben links.
 *
 * Warum nicht einfach eine Fläche: ein 1200×630-Rechteck in EINER Farbe sieht
 * in der WhatsApp-Vorschau nach Platzhalter aus. Verlauf + Schein kosten eine
 * Handvoll Rechenschritte je Pixel und lassen die Karte gestaltet wirken —
 * ohne dass jemand etwas einstellen muss.
 */
function paintBackground(surface: Surface, base: Rgb): void {
  const { width, height, data } = surface
  const glowX = width * 0.18
  const glowY = height * 0.04
  const glowR = width * 0.85
  const [br, bg, bb] = base
  // Bewusst skalar und ohne Hilfsfunktionen: 756.000 Pixel × ein Array je
  // Pixel kosteten in der ersten Fassung 280 ms allein an Zuteilung/GC —
  // so bleibt der Hintergrund bei ~15 ms.
  for (let y = 0; y < height; y++) {
    const dy = (y - glowY) * 1.35
    const dySq = dy * dy
    const depthY = (y / height) * 0.55
    for (let x = 0; x < width; x++) {
      const depth = ((x / width) * 0.45 + depthY) * 0.3
      const dx = x - glowX
      const dist = Math.sqrt(dx * dx + dySq) / glowR
      const glow = dist >= 1 ? 0 : (1 - dist) * (1 - dist) * 0.16
      const keep = (1 - depth) * (1 - glow)
      const lift = glow * 255
      const i = (y * width + x) * 3
      data[i] = (br * keep + lift + 0.5) | 0
      data[i + 1] = (bg * keep + lift + 0.5) | 0
      data[i + 2] = (bb * keep + lift + 0.5) | 0
    }
  }
}

/** Kreis mit weichem Rand (Deckung aus dem Abstand zur Kante). */
function fillCircle(surface: Surface, cx: number, cy: number, r: number, color: Rgb, alpha = 1): void {
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

function fillRect(surface: Surface, x: number, y: number, w: number, h: number, color: Rgb, alpha = 1): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) blend(surface, px, py, color, alpha)
  }
}

interface Coverage {
  data: Uint8Array
  width: number
  height: number
}

/**
 * Eine Glyphe auf Zielgröße bringen.
 *
 * Verkleinern heißt hier flächenmitteln, und das ist bei einer Deckungsmaske
 * nicht bloß „gut genug", sondern die richtige Rechnung: der Mittelwert der
 * Teilflächen IST die Deckung des größeren Pixels (Supersampling). Deshalb
 * genügt EINE gebackene Größe für alles von 72 px bis zur Wortmarke mit 26 px.
 * Vergrößert wird nie (die Karte zeichnet höchstens in Backgröße).
 */
function scaleCoverage(src: Coverage, scale: number): Coverage {
  if (scale >= 0.999 || src.width === 0) return src
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

/** Zeichensatz-Zugriff mit Größen-Cache je Bild (dieselbe Glyphe wiederholt sich). */
class GlyphCache {
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
    const scaled = scaleCoverage(source, scale)
    this.cache.set(key, scaled)
    return scaled
  }
}

function drawCoverage(surface: Surface, cov: Coverage, x: number, y: number, color: Rgb, alpha: number): void {
  for (let cy = 0; cy < cov.height; cy++) {
    for (let cx = 0; cx < cov.width; cx++) {
      const value = cov.data[cy * cov.width + cx]!
      if (value > 0) blend(surface, x + cx, y + cy, color, (value / 255) * alpha)
    }
  }
}

interface TextOptions {
  size: number
  color: Rgb
  alpha?: number
  tracking?: number
}

/** Eine Zeile Text an der Grundlinie `baseline` ab `x` setzen. */
function drawText(
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

/** Ein einzelnes Zeichen mittig in einen Punkt setzen (Initial im Kreis). */
function drawGlyphCentered(
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

export interface BrandCardInput {
  /** Primärfarbe des Community-Themes (resolveBrandColor) */
  color: string
  /** Anzeigename der Community (tenants.name) */
  name: string
  /** Dezente Wortmarke unten (maui.brand.name) */
  wordmark: string
}

/**
 * Die Karte als PNG-Datei.
 *
 * Reihenfolge = Ebenen: Hintergrund, Markenkreis mit Initial, Name,
 * Trennstrich, Wortmarke. Tinte (weiß oder fast schwarz) kommt aus derselben
 * Kontrast-Rechnung wie beim Favicon (brandInkColor) — auf den hellen Themes
 * des Katalogs (Citrus, Honey) wäre weißer Text sonst unlesbar.
 */
export async function renderBrandCardPng(input: BrandCardInput, font: BrandCardFont = BRAND_CARD_FONT): Promise<Buffer> {
  const base = toRgb(input.color)
  const ink = toRgb(brandInkColor(input.color))
  const surface: Surface = {
    width: BRAND_CARD_WIDTH,
    height: BRAND_CARD_HEIGHT,
    data: new Uint8Array(BRAND_CARD_WIDTH * BRAND_CARD_HEIGHT * 3),
  }
  const cache = new GlyphCache(font, pixels(font))
  const { pad, markRadius, ruleY, ruleWidth, ruleHeight, wordmarkSize, wordmarkBaseline, wordmarkTracking } = BRAND_CARD_LAYOUT

  paintBackground(surface, base)

  // Markenkreis wie im Favicon, nur groß: Tinte als Fläche, Initial in der
  // Basisfarbe — dieselbe Bildmarke, die im Browser-Tab steht.
  const title = layoutBrandCardTitle(input.name, font)
  const initial = [...sanitizeBrandCardText(input.name, font).toUpperCase()][0] ?? ''
  fillCircle(surface, pad + markRadius, pad + markRadius, markRadius, ink)
  if (initial) {
    drawGlyphCentered(surface, cache, font, initial, pad + markRadius, pad + markRadius, markRadius * 1.2, base)
  }

  for (const line of title.lines) {
    drawText(surface, cache, font, line.text, pad, line.baseline, { size: title.size, color: ink })
  }

  fillRect(surface, pad, ruleY, ruleWidth, ruleHeight, ink, 0.55)

  const wordmark = sanitizeBrandCardText(input.wordmark, font)
  if (wordmark) {
    drawText(surface, cache, font, wordmark, pad, wordmarkBaseline, {
      size: wordmarkSize,
      color: ink,
      alpha: 0.78,
      tracking: wordmarkTracking,
    })
  }

  return encodePngRgb(surface.width, surface.height, surface.data)
}

/** Breite der Wortmarke — nur für Tests/Layout-Prüfungen. */
export function brandCardWordmarkWidth(text: string, font: BrandCardFont = BRAND_CARD_FONT): number {
  return measureBrandCardText(text, font, BRAND_CARD_LAYOUT.wordmarkSize, BRAND_CARD_LAYOUT.wordmarkTracking)
}
