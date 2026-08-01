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
 * gemischt. Das ist reine Arithmetik über einen Byte-Puffer (die Werkzeuge
 * dafür stehen seit dem App-Icon in brandRaster.ts): keine neue Abhängigkeit,
 * kein natives Binary im Deploy, ~35 ms für ein Bild, das je Community EINMAL
 * entsteht und danach von Platte kommt
 * (apps/platform/server/utils/brandImageStore.ts).
 *
 * Was bewusst NICHT drauf ist: das Logo/Bild des Kunden (es gibt kein
 * Upload-Feld — mögliche Ergänzung später), Mitgliederzahlen oder sonstige
 * Zahlen (sie veralten im Cache der Vorschau-Dienste) und jede Form von
 * Pukalani-Bildsprache außer der kleinen Wortmarke: die Karte soll nach der
 * COMMUNITY aussehen, nicht nach uns.
 */
import { brandInkColor } from './brandMark'
import {
  BRAND_CARD_HEIGHT,
  BRAND_CARD_LAYOUT,
  BRAND_CARD_WIDTH,
  layoutBrandCardTitle,
  sanitizeBrandCardText,
  type BrandCardFont,
} from './brandCard'
import { BRAND_CARD_FONT } from './brandCardFont.gen'
import {
  createSurface,
  drawGlyphCentered,
  drawText,
  fillCircle,
  fillRect,
  fontPixels,
  GlyphCache,
  toRgb,
  type Rgb,
  type Surface,
} from './brandRaster'
import { encodePngRgb } from './pngEncode'

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

export interface BrandCardInput {
  /** Primärfarbe des Community-Themes (resolveBrandColor) */
  color: string
  /** Anzeigename der Community (tenants.name) */
  name: string
  /** Dezente Wortmarke unten (pukalani.brand.name) */
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
  const surface = createSurface(BRAND_CARD_WIDTH, BRAND_CARD_HEIGHT)
  const cache = new GlyphCache(font, fontPixels(font))
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

  /**
   * Der Strich gehört zur Wortmarke, nicht zum Titel: ohne sie wäre er eine
   * Linie, die auf nichts zeigt. Deshalb beide zusammen — oder keins.
   */
  const wordmark = sanitizeBrandCardText(input.wordmark, font)
  if (wordmark) {
    fillRect(surface, pad, ruleY, ruleWidth, ruleHeight, ink, 0.55)
    drawText(surface, cache, font, wordmark, pad, wordmarkBaseline, {
      size: wordmarkSize,
      color: ink,
      alpha: 0.78,
      tracking: wordmarkTracking,
    })
  }

  return encodePngRgb(surface.width, surface.height, surface.data)
}
