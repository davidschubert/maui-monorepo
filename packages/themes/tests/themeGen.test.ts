import { describe, it, expect } from 'vitest'
import { generateTheme, buildRegistryModule, specColorToHex, type ThemeSpec } from '../shared/themeGen'
import { SHADES, contrastRatio } from '../shared/ramp'

const OCEAN: ThemeSpec = {
  id: 'ocean',
  name: 'Ocean',
  base: '#2f7fee',
  variants: [{ id: 'teal', base: '#3be3d5' }],
}

describe('specColorToHex', () => {
  it('akzeptiert Hex und oklch()-Notation', () => {
    expect(specColorToHex('#2F7FEE')).toBe('#2f7fee')
    expect(specColorToHex('oklch(58.5% 0.233 277.117)')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('lehnt Müll ab', () => {
    expect(specColorToHex('blau')).toBeNull()
    expect(specColorToHex('rgb(1,2,3)')).toBeNull()
  })
})

describe('generateTheme', () => {
  it('emittiert alle 11 Stufen für Basis und Variante im Bestands-CSS-Format', () => {
    const theme = generateTheme(OCEAN)
    expect(theme.css).toContain(`:root[data-theme='ocean'] {`)
    expect(theme.css).toContain(`.dark[data-theme='ocean'] {`)
    expect(theme.css).toContain(`:root[data-theme='ocean'][data-variant='teal'] {`)
    for (const shade of SHADES) {
      expect(theme.css).toContain(`--ui-color-primary-${shade}: `)
    }
    // Registry-Farben = primary-500 (Hex)
    expect(theme.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(theme.variants).toEqual([{ id: 'teal', color: expect.stringMatching(/^#[0-9a-f]{6}$/) }])
  })

  it('ist deterministisch (gleicher Input = identischer Output)', () => {
    expect(generateTheme(OCEAN)).toEqual(generateTheme(OCEAN))
  })

  it('Kontrast-Gate: gewählte --ui-primary-Stufen bestehen ≥ 3:1 gegen den Seitengrund', () => {
    const theme = generateTheme(OCEAN)
    const light = /--ui-primary: var\(--ui-color-primary-(\d+)\);/.exec(theme.css)!
    const lightHex = new RegExp(`--ui-color-primary-${light[1]}: (#[0-9a-f]{6});`).exec(theme.css)![1]!
    expect(contrastRatio(lightHex, '#ffffff')!).toBeGreaterThanOrEqual(3)
  })

  it('Kontrast-Gate-Invariante hält auch für extreme Basisfarben', () => {
    // Die perceived-Ramp ankert Helligkeiten so, dass 600/400 meist reichen —
    // entscheidend ist die INVARIANTE (nie <3:1), nicht ob verschoben wurde.
    for (const base of ['#ffe66d', '#fef9e7', '#0b0b10', '#ff00ff']) {
      const theme = generateTheme({ id: 'extreme', name: 'X', base, variants: [] })
      const light = /--ui-primary: var\(--ui-color-primary-(\d+)\);/.exec(theme.css)!
      const lightHex = new RegExp(`--ui-color-primary-${light[1]}: (#[0-9a-f]{6});`).exec(theme.css)![1]!
      expect(contrastRatio(lightHex, '#ffffff')!).toBeGreaterThanOrEqual(3)
    }
  })

  it('wirft bei ungültiger Basisfarbe', () => {
    expect(() => generateTheme({ id: 'x', name: 'X', base: 'nope', variants: [] })).toThrow(/ungültige Basisfarbe/)
  })
})

describe('buildRegistryModule', () => {
  it('erzeugt einen typisierten Registry-Export mit file-Referenzen', () => {
    const theme = generateTheme(OCEAN)
    const module_ = buildRegistryModule([theme], [OCEAN])
    expect(module_).toContain(`import type { MauiTheme } from './themeRegistry'`)
    expect(module_).toContain(`{ id: 'ocean', name: 'Ocean', file: '/themes/ocean.css', color: '${theme.color}'`)
    expect(module_).toContain(`{ id: 'teal', color: '`)
  })
})
