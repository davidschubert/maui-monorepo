import { describe, expect, it } from 'vitest'
import { contrastRatio, customThemeAttr, customThemeCss, generateRamp, HEX_COLOR_RE, hexToRgb, SHADES, wcagLevel } from '../shared/ramp'
import { oklchToHex, rgbToOklch } from '../shared/oklch'

describe('hexToRgb', () => {
  it('parst 6-stellige Hex-Farben (case-insensitiv)', () => {
    expect(hexToRgb('#2f7fee')).toEqual([47, 127, 238])
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255])
  })
  it('lehnt Kurzform/Müll ab', () => {
    expect(hexToRgb('#fff')).toBeNull()
    expect(hexToRgb('rot')).toBeNull()
  })
})

describe('oklch', () => {
  it('Roundtrip hex → oklch → hex bleibt (nahezu) stabil', () => {
    for (const hex of ['#2f7fee', '#0d9488', '#eab308', '#111111', '#fafafa']) {
      const roundtrip = oklchToHex(rgbToOklch(hexToRgb(hex)!))
      // ±1 pro Kanal (Rundung)
      const a = hexToRgb(hex)!
      const b = hexToRgb(roundtrip)!
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(1)
    }
  })
  it('Gamut-Clipping liefert gültiges sRGB (überhöhtes Chroma)', () => {
    expect(oklchToHex({ l: 0.6, c: 0.5, h: 145 })).toMatch(HEX_COLOR_RE)
  })
  it('Weiß/Schwarz haben L≈1/L≈0', () => {
    expect(rgbToOklch([255, 255, 255]).l).toBeCloseTo(1, 2)
    expect(rgbToOklch([0, 0, 0]).l).toBeCloseTo(0, 2)
  })
})

describe('generateRamp (perceived, Default)', () => {
  it('liefert alle 11 Stufen als gültige Hex-Farben', () => {
    const ramp = generateRamp('#2F7FEE')!
    expect(Object.keys(ramp)).toHaveLength(SHADES.length)
    for (const shade of SHADES) expect(ramp[shade]).toMatch(HEX_COLOR_RE)
  })
  it('expliziter Anker hält die Basisfarbe exakt auf der Stufe', () => {
    const ramp = generateRamp('#2f7fee', { anchor: 500 })!
    expect(ramp[500]).toBe('#2f7fee')
    const ramp300 = generateRamp('#eab308', { anchor: 300 })!
    expect(ramp300[300]).toBe('#eab308')
  })
  it('Auto-Anker wählt eine Stufe mit der Basisfarbe exakt', () => {
    const ramp = generateRamp('#2f7fee')!
    expect(SHADES.some(shade => ramp[shade] === '#2f7fee')).toBe(true)
  })
  it('wahrgenommene Helligkeit fällt monoton von 50 → 950', () => {
    const ramp = generateRamp('#0d9488', { anchor: 600 })!
    const lightness = SHADES.map(shade => rgbToOklch(hexToRgb(ramp[shade])!)!.l)
    for (let i = 1; i < lightness.length; i++) {
      expect(lightness[i - 1]!).toBeGreaterThan(lightness[i]!)
    }
  })
  it('lightnessMax/Min begrenzen die Enden', () => {
    const ramp = generateRamp('#2f7fee', { anchor: 500, lightnessMax: 90, lightnessMin: 30 })!
    expect(rgbToOklch(hexToRgb(ramp[50])!)!.l).toBeLessThan(0.92)
    expect(rgbToOklch(hexToRgb(ramp[950])!)!.l).toBeGreaterThan(0.27)
  })
  it('saturation 0 entsättigt alle Nicht-Anker-Stufen', () => {
    const ramp = generateRamp('#2f7fee', { anchor: 500, saturation: 0 })!
    expect(rgbToOklch(hexToRgb(ramp[300])!)!.c).toBeLessThan(0.01)
  })
  it('hueShift dreht die Enden, nicht den Anker', () => {
    const base = generateRamp('#2f7fee', { anchor: 500 })!
    const shifted = generateRamp('#2f7fee', { anchor: 500, hueShift: 60 })!
    expect(shifted[500]).toBe(base[500])
    expect(shifted[950]).not.toBe(base[950])
  })
  it('ungültige Farbe → null', () => {
    expect(generateRamp('blau')).toBeNull()
  })
})

describe('generateRamp (linear, v1-Kompatibilität)', () => {
  it('Basis = 500, alle Stufen gültig', () => {
    const ramp = generateRamp('#2F7FEE', { mode: 'linear' })!
    expect(ramp[500]).toBe('#2f7fee')
    for (const shade of SHADES) expect(ramp[shade]).toMatch(HEX_COLOR_RE)
  })
})

describe('customThemeCss', () => {
  it('erzeugt data-theme-Block mit Ramp + Hell/Dunkel-Primary', () => {
    const css = customThemeCss({ id: 'abc123', name: 'Test', primary: '#2f7fee', order: 0, config: { anchor: 500 } })
    expect(css).toContain(`:root[data-theme='c-abc123']`)
    expect(css).toContain('--ui-color-primary-500: #2f7fee;')
    expect(css).toContain(`.dark[data-theme='c-abc123']`)
  })
  it('radius aus der Config landet als --ui-radius im Block', () => {
    const css = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: { radius: 0.375 } })
    expect(css).toContain('--ui-radius: 0.375rem;')
  })
  it('attrOverride erlaubt Draft-Vorschau unter eigenem Attribut', () => {
    expect(customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0 }, 'c-draft')).toContain(`[data-theme='c-draft']`)
  })
  it('ungültige Farbe → leerer String', () => {
    expect(customThemeCss({ id: 'x', name: 'X', primary: 'kaputt', order: 0 })).toBe('')
  })
  it('customThemeAttr prefixt kollisionfrei', () => {
    expect(customThemeAttr('ocean')).toBe('c-ocean')
  })
})

describe('contrastRatio + wcagLevel', () => {
  it('Schwarz/Weiß = 21, identisch = 1, symmetrisch', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#2f7fee', '#2f7fee')).toBeCloseTo(1, 5)
    expect(contrastRatio('#123456', '#fedcba')).toBeCloseTo(contrastRatio('#fedcba', '#123456')!, 10)
  })
  it('wcagLevel-Schwellen', () => {
    expect(wcagLevel(21)).toBe('AAA')
    expect(wcagLevel(5)).toBe('AA')
    expect(wcagLevel(3.2)).toBe('AA18')
    expect(wcagLevel(2)).toBe('fail')
  })
})
