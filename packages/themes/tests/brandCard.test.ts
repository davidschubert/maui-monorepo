import { describe, it, expect } from 'vitest'
import { inflateSync } from 'node:zlib'
import {
  BRAND_CARD_HEIGHT,
  BRAND_CARD_KEY_PATTERN,
  BRAND_CARD_LAYOUT,
  BRAND_CARD_WIDTH,
  brandCardKey,
  brandCardPath,
  layoutBrandCardTitle,
  measureBrandCardText,
  sanitizeBrandCardText,
} from '../shared/brandCard'
import { BRAND_CARD_FONT } from '../shared/brandCardFont.gen'
import { renderBrandCardPng } from '../shared/brandCardPng'
import { encodePngRgb } from '../shared/pngEncode'

const FONT = BRAND_CARD_FONT
const MAX_WIDTH = BRAND_CARD_WIDTH - BRAND_CARD_LAYOUT.pad * 2

describe('brandCardKey', () => {
  it('ist stabil für gleiche Eingaben', () => {
    expect(brandCardKey('#ff7a18', 'Morgenlicht')).toBe(brandCardKey('#ff7a18', 'Morgenlicht'))
  })

  it('wandert bei anderer Farbe oder anderem Namen', () => {
    const base = brandCardKey('#ff7a18', 'Morgenlicht')
    expect(brandCardKey('#0055ff', 'Morgenlicht')).not.toBe(base)
    expect(brandCardKey('#ff7a18', 'Abendlicht')).not.toBe(base)
  })

  it('passt in die Route-Form (sonst antwortet /og/<key>.png mit 404)', () => {
    for (const name of ['Morgenlicht', 'A', '', 'Ärzte & Co. – Verein']) {
      expect(brandCardKey('#ff7a18', name)).toMatch(BRAND_CARD_KEY_PATTERN)
    }
  })

  it('baut den Pfad, den der Kopf verlinkt', () => {
    expect(brandCardPath('abc1234')).toBe('/og/abc1234.png')
  })
})

describe('sanitizeBrandCardText', () => {
  it('behält deutsche Umlaute und typografische Zeichen', () => {
    expect(sanitizeBrandCardText('Alte Mühle – Wolfenbüttel', FONT)).toBe('Alte Mühle – Wolfenbüttel')
  })

  it('normalisiert Leerraum', () => {
    expect(sanitizeBrandCardText('  Zwei\n\tWörter  ', FONT)).toBe('Zwei Wörter')
  })

  it('läßt Zeichen ohne Glyphe weg statt Kästchen zu zeigen', () => {
    // Kyrillisch/CJK sind nicht gebacken — der lateinische Rest bleibt stehen
    expect(sanitizeBrandCardText('Клуб Berlin', FONT)).toBe('Berlin')
    expect(sanitizeBrandCardText('東京', FONT)).toBe('')
  })
})

describe('layoutBrandCardTitle', () => {
  it('setzt einen kurzen Namen in der größten Stufe auf eine Zeile', () => {
    const title = layoutBrandCardTitle('Morgenlicht', FONT)
    expect(title.size).toBe(BRAND_CARD_LAYOUT.titleSizes[0])
    expect(title.lines).toHaveLength(1)
    expect(title.lines[0]?.baseline).toBe(BRAND_CARD_LAYOUT.titleBaseline)
  })

  it('bricht einen langen Namen auf zwei Zeilen und verankert sie unten', () => {
    const title = layoutBrandCardTitle('Freundeskreis Alte Mühle Wolfenbüttel e. V.', FONT)
    expect(title.lines).toHaveLength(2)
    expect(title.lines[1]?.baseline).toBe(BRAND_CARD_LAYOUT.titleBaseline)
    expect(title.lines[0]?.baseline).toBeLessThan(BRAND_CARD_LAYOUT.titleBaseline)
    expect(title.lines.map(line => line.text).join(' ')).toBe('Freundeskreis Alte Mühle Wolfenbüttel e. V.')
  })

  it('verkleinert erst die Schrift, bevor es kappt', () => {
    const long = 'Gemeinschaft für gelebte Nachbarschaft im Stadtteil Nord und Umgebung'
    const title = layoutBrandCardTitle(long, FONT)
    expect(title.size).toBeLessThan(BRAND_CARD_LAYOUT.titleSizes[0] as number)
    expect(title.lines.map(line => line.text).join(' ')).toBe(long)
  })

  it('kappt mit Auslassungszeichen, wenn selbst die kleinste Stufe nicht reicht', () => {
    const title = layoutBrandCardTitle('Donaudampfschifffahrtsgesellschaftskapitaenspatentpruefungsverein', FONT)
    expect(title.lines.at(-1)?.text.endsWith('…')).toBe(true)
  })

  it('hält jede Zeile innerhalb der Satzbreite', () => {
    const names = [
      'Morgenlicht',
      'Freundeskreis Alte Mühle Wolfenbüttel e. V.',
      'Gemeinschaft für gelebte Nachbarschaft im Stadtteil Nord und Umgebung',
      'Donaudampfschifffahrtsgesellschaftskapitaenspatentpruefungsverein',
      'Ä',
    ]
    for (const name of names) {
      const title = layoutBrandCardTitle(name, FONT)
      for (const line of title.lines) {
        expect(measureBrandCardText(line.text, FONT, title.size)).toBeLessThanOrEqual(MAX_WIDTH)
      }
    }
  })

  it('kommt mit einem Namen ohne gebackene Zeichen ohne Zeile aus', () => {
    expect(layoutBrandCardTitle('東京', FONT).lines).toHaveLength(0)
  })
})

describe('encodePngRgb', () => {
  it('schreibt Signatur, IHDR mit den Maßen und IEND', async () => {
    const png = await encodePngRgb(2, 2, new Uint8Array(2 * 2 * 3))
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(2)
    expect(png[24]).toBe(8) // Bittiefe
    expect(png[25]).toBe(2) // Farbtyp RGB
    expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND')
  })

  it('liefert die Pixel unverändert zurück (Filter sind umkehrbar)', async () => {
    const width = 5
    const height = 3
    const rgb = new Uint8Array(width * height * 3)
    for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 37) % 256
    const png = await encodePngRgb(width, height, rgb)

    // IDAT suchen und entpacken, dann die Zeilenfilter zurückrechnen
    let offset = 8
    let idat: Buffer | null = null
    while (offset < png.length) {
      const length = png.readUInt32BE(offset)
      const type = png.subarray(offset + 4, offset + 8).toString('ascii')
      if (type === 'IDAT') idat = png.subarray(offset + 8, offset + 8 + length)
      offset += length + 12
    }
    expect(idat).not.toBeNull()
    const raw = inflateSync(idat as Buffer)
    const stride = width * 3
    const out = new Uint8Array(rgb.length)
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)]!
      for (let i = 0; i < stride; i++) {
        const value = raw[y * (stride + 1) + 1 + i]!
        const left = i >= 3 ? out[y * stride + i - 3]! : 0
        const up = y > 0 ? out[(y - 1) * stride + i]! : 0
        const base = filter === 1 ? left : filter === 2 ? up : 0
        out[y * stride + i] = (value + base) & 0xff
      }
    }
    expect([...out]).toEqual([...rgb])
  })

  it('weist einen Puffer zurück, der nicht zu den Maßen passt', async () => {
    await expect(encodePngRgb(2, 2, new Uint8Array(3))).rejects.toThrow()
  })
})

describe('renderBrandCardPng', () => {
  it('liefert ein PNG in Social-Maßen', async () => {
    const png = await renderBrandCardPng({ color: '#ff7a18', name: 'Morgenlicht', wordmark: 'Pukalani' })
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(BRAND_CARD_WIDTH)
    expect(png.readUInt32BE(20)).toBe(BRAND_CARD_HEIGHT)
    // Deutlich unter jeder Vorschau-Grenze (Facebook/WhatsApp: 8 MB)
    expect(png.length).toBeLessThan(300 * 1024)
  })

  it('kommt ohne Namen und ohne brauchbare Farbe zu einem Bild statt zu einem Fehler', async () => {
    const png = await renderBrandCardPng({ color: 'keine-farbe', name: '', wordmark: 'Pukalani' })
    expect(png.readUInt32BE(16)).toBe(BRAND_CARD_WIDTH)
  })

  it('unterscheidet sich zwischen zwei Communities', async () => {
    const a = await renderBrandCardPng({ color: '#ff7a18', name: 'Morgenlicht', wordmark: 'Pukalani' })
    const b = await renderBrandCardPng({ color: '#0055ff', name: 'Abendrot', wordmark: 'Pukalani' })
    expect(a.equals(b)).toBe(false)
  })
})
