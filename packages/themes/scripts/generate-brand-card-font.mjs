/**
 * Backt die Schrift für die Bildmarken-Karte (og:image je Community) EINMAL in
 * ein Deckungs-Atlas — `shared/brandCardFont.gen.ts`.
 *
 * WARUM überhaupt: Facebook, WhatsApp und LinkedIn zeigen kein SVG als
 * og:image, es MUSS ein PNG/JPEG sein. Ein PNG heißt rastern, und rastern
 * heißt normalerweise: ein Renderer auf dem Server (resvg/sharp/satori =
 * native Binaries) oder ein Headless-Browser. Beides steht auf einer Maschine,
 * die schon sieben Apps und die Builds trägt, in keinem Verhältnis zu einem
 * Bild, das sich pro Community fast nie ändert.
 *
 * Der Ausweg ist derselbe wie bei den OG-Bildern der Landing
 * (apps/marketing/scripts/og-images.mjs): Chrome rendert — aber EINMAL hier,
 * nicht in Produktion. Gebacken wird nicht das Bild (das kennt den
 * Community-Namen nicht), sondern die ZEICHEN: pro Glyphe die
 * Deckungs-Bitmap, die Chrome mit seinem Text-Rasterizer erzeugt hat, plus
 * Vorschub und Versatz. Zur Laufzeit setzt der Server daraus Wörter zusammen
 * und schreibt ein PNG (shared/brandCardPng.ts) — reines JavaScript, keine
 * neue Abhängigkeit, kein natives Binary im Deploy.
 *
 * Die Schriftwahl ist bewusst dieselbe wie auf den Landing-Karten
 * (-apple-system → San Francisco auf dem Mac, auf dem gebacken wird): die
 * Bildmarke einer Community soll aus derselben Familie kommen wie die
 * Vorschaubilder der Landing. Der Nebeneffekt ist wichtig: das Ergebnis hängt
 * an den Schriften DIESER Maschine und ist deshalb NICHT reproduzierbar in CI.
 * Darum liegt das Atlas als committete .gen.ts vor und ist — anders als
 * public/themes/*.css (`check:themes`) — ABSICHTLICH nicht CI-geprüft.
 *
 * Aufruf:  pnpm --filter @pukalani/themes generate:brand-card-font
 * Danach:  shared/brandCardFont.gen.ts committen.
 */
import { chromium } from '@playwright/test'
import { gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../shared/brandCardFont.gen.ts')

/**
 * Backgröße in Pixeln. Die Karte zeichnet Text NIE größer als diese Größe
 * (Hochskalieren würde matschen), kleiner dagegen beliebig: eine
 * Deckungs-Bitmap flächengemittelt zu verkleinern IST Supersampling, das
 * Ergebnis ist schärfer als eine zweite gebackene Größe.
 */
const SIZE = 72
const WEIGHT = 700
const FAMILY = '-apple-system, "Helvetica Neue", Arial, sans-serif'

/**
 * Zeichenvorrat. Community-Namen sind Kundendaten, also potenziell jedes
 * Zeichen der Welt — gebacken wird der europäische Vorrat (ASCII, Latin-1,
 * die Sonderbuchstaben von Polnisch/Tschechisch/Türkisch/Baltisch, typografische
 * Anführungen und Striche). Was fehlt, fällt zur Laufzeit weg statt als
 * Kästchen zu erscheinen; bleibt nichts übrig, zeigt die Karte nur Farbe +
 * Wortmarke (brandCardPng.ts). Kyrillisch/CJK/Emoji wären ein zweites,
 * vielfach größeres Atlas — das kommt, wenn es einen Kunden dafür gibt.
 */
const CHARSET = [
  // ASCII (druckbar) + Latin-1-Ergänzung
  ...range(0x20, 0x7e),
  ...range(0xa0, 0xff),
  // Latin Extended-A (Auswahl): pl, cs, sk, tr, hu, ro, lv, lt, hr
  ...'ĀāĂăĄąĆćČčĎďĐđĒēĖėĘęĚěĞğĪīĮįŁłŃńŇňŌōŐőŒœŔŕŘřŚśŞşŠšŢţŤťŪūŮůŲųŸŹźŻżŽž',
  // Typografie (Namen enthalten regelmäßig echte Apostrophe und Gedankenstriche)
  ...'–—‘’‚“”„…•·′″€₂₃',
].join('')

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => String.fromCharCode(from + i))
}

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 })
await page.setContent('<!doctype html><html><body></body></html>')

const baked = await page.evaluate(({ chars, size, weight, family }) => {
  const PAD = 40
  const canvas = document.createElement('canvas')
  canvas.width = size * 4
  canvas.height = size * 4
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('kein 2D-Kontext')
  ctx.font = `${weight} ${size}px ${family}`
  ctx.textBaseline = 'alphabetic'

  const metrics = ctx.measureText('Hxg')
  const glyphs = []
  for (const ch of chars) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#fff'
    ctx.fillText(ch, PAD, PAD + size)
    const advance = ctx.measureText(ch).width
    const { data, width: iw, height: ih } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // Umschließendes Rechteck der Deckung suchen (R-Kanal genügt: Weiß auf Schwarz)
    let minX = iw, minY = ih, maxX = -1, maxY = -1
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        if (data[(y * iw + x) * 4] === 0) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0) {
      // Leerzeichen & Co.: nur Vorschub, keine Pixel
      glyphs.push({ ch, advance, left: 0, top: 0, width: 0, height: 0, data: '' })
      continue
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    let bytes = ''
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        bytes += String.fromCharCode(data[((minY + y) * iw + (minX + x)) * 4])
      }
    }
    glyphs.push({
      ch,
      advance,
      left: minX - PAD,
      top: minY - (PAD + size),
      width: w,
      height: h,
      data: btoa(bytes),
    })
  }
  return {
    ascent: metrics.fontBoundingBoxAscent ?? size * 0.8,
    descent: metrics.fontBoundingBoxDescent ?? size * 0.2,
    glyphs,
  }
}, { chars: CHARSET, size: SIZE, weight: WEIGHT, family: FAMILY })

await browser.close()

// Alle Deckungs-Bitmaps hintereinander in EINEN Block: ein gzip über alles
// komprimiert deutlich besser als hunderte Einzelblöcke.
const chunks = []
const meta = {}
let offset = 0
let painted = 0
for (const glyph of baked.glyphs) {
  const buf = Buffer.from(glyph.data, 'base64')
  meta[glyph.ch] = {
    a: round(glyph.advance),
    l: glyph.left,
    t: glyph.top,
    w: glyph.width,
    h: glyph.height,
    o: offset,
  }
  chunks.push(buf)
  offset += buf.length
  if (buf.length) painted++
}
const raw = Buffer.concat(chunks)
const packed = gzipSync(raw, { level: 9 }).toString('base64')

function round(value) {
  return Math.round(value * 100) / 100
}

const source = `/* GENERIERT von scripts/generate-brand-card-font.mjs — NICHT von Hand ändern.
 *
 * Deckungs-Atlas der Bildmarken-Karte (og:image je Community): pro Zeichen die
 * von Chrome gerasterte Alpha-Maske bei ${SIZE} px / Gewicht ${WEIGHT}, dazu Vorschub
 * (a) und Versatz vom Stift (l) bzw. von der Grundlinie (t).
 *
 * Warum ein Atlas und kein Renderer in Produktion: siehe Kopf des Generators.
 * Warum base64 im Quelltext und keine Binärdatei: der Server-Bundler nimmt ein
 * Modul garantiert mit — bei einer Datei neben dem Code hängt es daran, ob
 * Nitro sie in .output kopiert. ${(Buffer.byteLength(packed) / 1024).toFixed(0)} KB server-only (der Client sieht
 * dieses Modul nie: es wird ausschließlich von brandCardPng.ts geladen).
 *
 * Gebacken: ${new Date().toISOString().slice(0, 10)} · ${baked.glyphs.length} Zeichen (${painted} mit Pixeln) · ${(raw.length / 1024).toFixed(0)} KB entpackt
 */
import type { BrandCardFont } from './brandCard'

export const BRAND_CARD_FONT: BrandCardFont = {
  size: ${SIZE},
  ascent: ${round(baked.ascent)},
  descent: ${round(baked.descent)},
  glyphs: ${JSON.stringify(meta)},
  pixels: '${packed}',
}
`

writeFileSync(OUT, source)
console.log(`✔ ${baked.glyphs.length} Glyphen gebacken → shared/brandCardFont.gen.ts`)
console.log(`  entpackt ${(raw.length / 1024).toFixed(0)} KB · gepackt+base64 ${(Buffer.byteLength(packed) / 1024).toFixed(0)} KB`)
