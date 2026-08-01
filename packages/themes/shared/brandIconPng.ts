/**
 * Das App-Icon einer Community ZEICHNEN (Home-Bildschirm, quadratisches PNG) —
 * server-only (node:zlib über pngEncode.ts und für das Atlas).
 *
 * Es ist die dritte Ausprägung DERSELBEN Bildmarke: Kreis+Initiale im Tab
 * (`/favicon.svg`, SVG), Karte für geteilte Links (`/og/<key>.png`, 1200×630)
 * und hier die Kachel. Farbe und Name kommen aus derselben Auflösung
 * (`resolveTenantBrandMark()`), gezeichnet wird mit denselben Werkzeugen
 * (brandRaster.ts) — Tab, WhatsApp-Vorschau und Home-Bildschirm können also
 * nicht auseinanderlaufen.
 *
 * RANDLOS und nicht als Kreis wie das Favicon: Betriebssysteme maskieren die
 * Kachel selbst (iOS abgerundetes Quadrat, Android je nach Hersteller Kreis
 * oder Squircle). Ein Kreis IM Bild ergäbe eine zweite, versetzte Rundung mit
 * schwarzen Zwickeln außen herum — das Bild hat keinen Alpha-Kanal, „außen"
 * wäre also nicht durchsichtig, sondern schwarz.
 */
import { brandInkColor } from './brandMark'
import { sanitizeBrandCardText, type BrandCardFont } from './brandCard'
import { BRAND_CARD_FONT } from './brandCardFont.gen'
import { BRAND_ICON_DEFAULT_SIZE, BRAND_ICON_GLYPH_RATIO, type BrandIconSize } from './brandIcon'
import {
  createSurface,
  drawGlyphCentered,
  fillSurface,
  fontPixels,
  GlyphCache,
  toRgb,
  type Rgb,
  type Surface,
} from './brandRaster'
import { encodePngRgb } from './pngEncode'

/**
 * Der Untergrund: Basisfarbe, oben links ein weicher Lichtschein, zur unteren
 * rechten Ecke hin leicht abgedunkelt — dieselbe Lichtführung wie auf der
 * Vorschau-Karte, nur zurückhaltender.
 *
 * Zurückhaltender, weil die Kachel klein dargestellt wird: was auf 1200 px
 * Breite Tiefe erzeugt, sieht auf 60 px wie ein Fleck aus. Ganz flach soll sie
 * aber auch nicht sein — eine Kachel in EINER Farbe neben lauter gestalteten
 * App-Icons wirkt unfertig.
 */
function paintIconBackground(surface: Surface, base: Rgb): void {
  const { width, height, data } = surface
  const glowX = width * 0.28
  const glowY = height * 0.16
  const glowR = width * 0.95
  const [br, bg, bb] = base
  for (let y = 0; y < height; y++) {
    const dy = y - glowY
    const dySq = dy * dy
    const depthY = (y / height) * 0.5
    for (let x = 0; x < width; x++) {
      const depth = ((x / width) * 0.5 + depthY) * 0.18
      const dx = x - glowX
      const dist = Math.sqrt(dx * dx + dySq) / glowR
      const glow = dist >= 1 ? 0 : (1 - dist) * (1 - dist) * 0.12
      const keep = (1 - depth) * (1 - glow)
      const lift = glow * 255
      const i = (y * width + x) * 3
      data[i] = (br * keep + lift + 0.5) | 0
      data[i + 1] = (bg * keep + lift + 0.5) | 0
      data[i + 2] = (bb * keep + lift + 0.5) | 0
    }
  }
}

export interface BrandIconInput {
  /** Primärfarbe des Community-Themes (resolveBrandColor) */
  color: string
  /** Anzeigename der Community (tenants.name) */
  name: string
  /** Kantenlänge in Pixeln — nur Maße aus BRAND_ICON_SIZES */
  size?: BrandIconSize
}

/**
 * Das Icon als PNG-Datei.
 *
 * EIN Zeichen, wie beim Favicon: zwei Initialen sind auf einer Kachel neben
 * dem Namen darunter kein Gewinn an Information, kosten aber die Hälfte der
 * Größe. Bleibt vom Namen kein gebackenes Zeichen übrig (rein kyrillischer
 * oder japanischer Name), zeigt die Kachel die reine Farbe — immer noch ein
 * Icon, nur ohne Buchstaben, und immer noch unterscheidbar von der Community
 * nebenan.
 */
export async function renderBrandIconPng(input: BrandIconInput, font: BrandCardFont = BRAND_CARD_FONT): Promise<Buffer> {
  const size = input.size ?? BRAND_ICON_DEFAULT_SIZE
  const base = toRgb(input.color)
  const ink = toRgb(brandInkColor(input.color))
  const surface = createSurface(size, size)

  // Erst deckend füllen, dann die Lichtführung darüber: der Puffer startet auf
  // Schwarz, und ein Rundungsfehler am Rand wäre sonst ein dunkler Saum.
  fillSurface(surface, base)
  paintIconBackground(surface, base)

  const initial = [...sanitizeBrandCardText(input.name, font).toUpperCase()][0] ?? ''
  if (initial) {
    const cache = new GlyphCache(font, fontPixels(font))
    drawGlyphCentered(surface, cache, font, initial, size / 2, size / 2, size * BRAND_ICON_GLYPH_RATIO, ink)
  }

  return encodePngRgb(size, size, surface.data)
}
