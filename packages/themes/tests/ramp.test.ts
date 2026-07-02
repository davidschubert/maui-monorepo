import { describe, expect, it } from 'vitest'
import { contrastRatio, customThemeAttr, customThemeCss, generateRamp, HEX_COLOR_RE, hexToRgb, SHADES, wcagLevel } from '../shared/ramp'

describe('hexToRgb', () => {
  it('parst 6-stellige Hex-Farben (case-insensitiv)', () => {
    expect(hexToRgb('#2f7fee')).toEqual([47, 127, 238])
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255])
  })
  it('lehnt Kurzform/Müll ab', () => {
    expect(hexToRgb('#fff')).toBeNull()
    expect(hexToRgb('rot')).toBeNull()
    expect(hexToRgb('#gggggg')).toBeNull()
  })
})

describe('generateRamp', () => {
  it('liefert alle 11 Stufen, Basis = 500', () => {
    const ramp = generateRamp('#2F7FEE')!
    expect(Object.keys(ramp)).toHaveLength(SHADES.length)
    expect(ramp[500]).toBe('#2f7fee')
    for (const shade of SHADES) expect(ramp[shade]).toMatch(HEX_COLOR_RE)
  })
  it('helle Stufen werden heller, dunkle dunkler (monotone Luminanz)', () => {
    const ramp = generateRamp('#2f7fee')!
    const luminance = (hex: string) => hexToRgb(hex)!.reduce((a, b) => a + b, 0)
    for (let i = 1; i < SHADES.length; i++) {
      expect(luminance(ramp[SHADES[i - 1]!])).toBeGreaterThan(luminance(ramp[SHADES[i]!]))
    }
  })
  it('ungültige Farbe → null', () => {
    expect(generateRamp('blau')).toBeNull()
  })
})

describe('customThemeCss', () => {
  it('erzeugt data-theme-Block mit Ramp + Hell/Dunkel-Primary', () => {
    const css = customThemeCss({ id: 'abc123', name: 'Test', primary: '#2f7fee', order: 0 })
    expect(css).toContain(`:root[data-theme='c-abc123']`)
    expect(css).toContain('--ui-color-primary-500: #2f7fee;')
    expect(css).toContain('--ui-primary: var(--ui-color-primary-600);')
    expect(css).toContain(`.dark[data-theme='c-abc123']`)
  })
  it('ungültige Farbe → leerer String (kein kaputtes CSS)', () => {
    expect(customThemeCss({ id: 'x', name: 'X', primary: 'kaputt', order: 0 })).toBe('')
  })
  it('customThemeAttr prefixt kollisionfrei', () => {
    expect(customThemeAttr('ocean')).toBe('c-ocean') // kollidiert nicht mit Built-in 'ocean'
  })
})

describe('contrastRatio + wcagLevel', () => {
  it('Schwarz/Weiß = 21, identisch = 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#2f7fee', '#2f7fee')).toBeCloseTo(1, 5)
  })
  it('ist symmetrisch', () => {
    expect(contrastRatio('#123456', '#fedcba')).toBeCloseTo(contrastRatio('#fedcba', '#123456')!, 10)
  })
  it('wcagLevel-Schwellen', () => {
    expect(wcagLevel(21)).toBe('AAA')
    expect(wcagLevel(5)).toBe('AA')
    expect(wcagLevel(3.2)).toBe('AA18')
    expect(wcagLevel(2)).toBe('fail')
  })
})
