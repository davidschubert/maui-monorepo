import { describe, it, expect } from 'vitest'
import {
  BRAND_ICON_DEFAULT_SIZE,
  BRAND_ICON_KEY_PATTERN,
  BRAND_ICON_SIZES,
  BRAND_ICON_TOUCH_SIZE,
  brandIconKey,
  brandIconPath,
  isBrandIconSize,
} from '../shared/brandIcon'
import { brandCardKey } from '../shared/brandCard'
import { renderBrandIconPng } from '../shared/brandIconPng'

/** PNG-Signatur — die ersten acht Bytes jeder gültigen Datei. */
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('brandIconKey', () => {
  it('ist stabil für gleiche Eingaben', () => {
    expect(brandIconKey('#ff7a18', 'Morgenlicht')).toBe(brandIconKey('#ff7a18', 'Morgenlicht'))
  })

  it('wandert bei anderer Farbe oder anderem Namen', () => {
    const base = brandIconKey('#ff7a18', 'Morgenlicht')
    expect(brandIconKey('#0055ff', 'Morgenlicht')).not.toBe(base)
    expect(brandIconKey('#ff7a18', 'Abendrot')).not.toBe(base)
  })

  it('verwischt keine Teil-Grenze (Trennzeichen im Hash)', () => {
    expect(brandIconKey('#ff7a1', '8Morgenlicht')).not.toBe(brandIconKey('#ff7a18', 'Morgenlicht'))
  })

  it('trennt sich vom Schlüssel der Vorschau-Karte', () => {
    // Eigener Gestaltungs-Stand: eine Umgestaltung der Karte darf nicht jedes
    // Home-Bildschirm-Icon neu ausliefern (und umgekehrt).
    expect(brandIconKey('#ff7a18', 'Morgenlicht')).not.toBe(brandCardKey('#ff7a18', 'Morgenlicht'))
  })

  it('passt in die Route-Form (sonst antwortet /icon/<key>.png mit 404)', () => {
    for (const name of ['Morgenlicht', 'A', '', 'Ärzte & Co. – Verein', '東京']) {
      expect(brandIconKey('#ff7a18', name)).toMatch(BRAND_ICON_KEY_PATTERN)
    }
  })
})

describe('brandIconPath', () => {
  it('baut den Pfad, den der Kopf verlinkt', () => {
    expect(brandIconPath('abc1234')).toBe('/icon/abc1234.png')
    expect(brandIconPath('abc1234', BRAND_ICON_DEFAULT_SIZE)).toBe('/icon/abc1234.png')
    expect(brandIconPath('abc1234', BRAND_ICON_TOUCH_SIZE)).toBe('/icon/abc1234.png?size=180')
  })
})

describe('isBrandIconSize', () => {
  it('lässt genau die ausgelieferten Maße durch', () => {
    for (const size of BRAND_ICON_SIZES) {
      expect(isBrandIconSize(size)).toBe(true)
      expect(isBrandIconSize(String(size))).toBe(true)
    }
  })

  it('weist alles andere ab — sonst rechnet ein Bot beliebig große Bilder', () => {
    for (const value of [0, 1, 181, 9999, -512, 'groß', '', null, undefined, {}]) {
      expect(isBrandIconSize(value)).toBe(false)
    }
  })
})

describe('renderBrandIconPng', () => {
  it('liefert ein quadratisches PNG in jeder ausgelieferten Größe', async () => {
    for (const size of BRAND_ICON_SIZES) {
      const png = await renderBrandIconPng({ color: '#ff7a18', name: 'Morgenlicht', size })
      expect([...png.subarray(0, 8)]).toEqual(PNG_MAGIC)
      expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
      expect(png[24]).toBe(8) // Bittiefe
      expect(png[25]).toBe(2) // Farbtyp RGB — kein Alpha (iOS füllt sonst schwarz)
      expect(png.subarray(-8, -4).toString('ascii')).toBe('IEND')
    }
  })

  it('zeichnet ohne Größenangabe die Voreinstellung', async () => {
    const png = await renderBrandIconPng({ color: '#ff7a18', name: 'Morgenlicht' })
    expect(png.readUInt32BE(16)).toBe(BRAND_ICON_DEFAULT_SIZE)
  })

  it('unterscheidet sich zwischen zwei Communities', async () => {
    const a = await renderBrandIconPng({ color: '#ff7a18', name: 'Morgenlicht' })
    const b = await renderBrandIconPng({ color: '#0055ff', name: 'Abendrot' })
    expect(a.equals(b)).toBe(false)
  })

  it('unterscheidet zwei Communities auch bei gleicher Farbe (die Initiale)', async () => {
    const a = await renderBrandIconPng({ color: '#ff7a18', name: 'Morgenlicht', size: 180 })
    const b = await renderBrandIconPng({ color: '#ff7a18', name: 'Abendrot', size: 180 })
    expect(a.equals(b)).toBe(false)
  })

  it('kommt ohne Namen und ohne brauchbare Farbe zu einem Bild statt zu einem Fehler', async () => {
    const png = await renderBrandIconPng({ color: 'keine-farbe', name: '' })
    expect([...png.subarray(0, 8)]).toEqual(PNG_MAGIC)
    expect(png.readUInt32BE(16)).toBe(BRAND_ICON_DEFAULT_SIZE)
  })

  it('kommt mit einem Namen ohne gebackene Zeichen zur reinen Farbkachel', async () => {
    // Kyrillisch/CJK sind nicht im Atlas — die Kachel bleibt ein Icon, nur
    // ohne Buchstaben (kein Kästchen-Glyph, kein Fehler).
    const png = await renderBrandIconPng({ color: '#ff7a18', name: '東京', size: 180 })
    expect(png.readUInt32BE(16)).toBe(180)
    expect(png.equals(await renderBrandIconPng({ color: '#ff7a18', name: '', size: 180 }))).toBe(true)
  })

  it('bleibt klein genug, um aus dem Speicher bedient zu werden', async () => {
    const png = await renderBrandIconPng({ color: '#ff7a18', name: 'Morgenlicht' })
    expect(png.length).toBeLessThan(200 * 1024)
  })
})
