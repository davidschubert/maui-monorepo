import { describe, expect, it } from 'vitest'
import { contrastRatio, customThemeAttr, customThemeCss, generateNeutralRamp, generateRamp, HEX_COLOR_RE, hexToRgb, SHADES, wcagLevel } from '../shared/ramp'
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

describe('customThemeCss Injection-Härtung (Spiegel der admin-Zod-Allowlist)', () => {
  const base = { name: 'X', primary: '#2f7fee', order: 0 }

  it('bösartige Row-ID/attrOverride → fail closed (kein CSS)', () => {
    expect(customThemeCss({ ...base, id: `x'] body { display:none } [x='` })).toBe('')
    expect(customThemeCss({ ...base, id: 'x' }, `c-draft'] </style>`)).toBe('')
  })

  it('bösartige Varianten-ID → nur der Varianten-Block fällt raus', () => {
    const css = customThemeCss({
      ...base,
      id: 'x',
      variants: [
        { id: 'teal', color: '#0d9488' },
        { id: `evil'] html`, color: '#0d9488' },
      ],
    })
    expect(css).toContain(`[data-variant='teal']`)
    expect(css).not.toContain('evil')
  })

  it('reguläre IDs bleiben erlaubt', () => {
    expect(customThemeCss({ ...base, id: 'abc123' })).toContain(`[data-theme='c-abc123']`)
    expect(customThemeCss({ ...base, id: 'x' }, 'c-draft')).toContain(`[data-theme='c-draft']`)
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

describe('generateNeutralRamp (Tinted Neutral)', () => {
  it('liefert 11 gültige Hex-Farben', () => {
    const ramp = generateNeutralRamp('#2f7fee')!
    expect(Object.keys(ramp)).toHaveLength(SHADES.length)
    for (const shade of SHADES) expect(ramp[shade]).toMatch(HEX_COLOR_RE)
  })
  it('Helligkeit fällt streng monoton von 50 nach 950', () => {
    const ramp = generateNeutralRamp('#0d9488')!
    const ls = SHADES.map(s => rgbToOklch(hexToRgb(ramp[s])!).l)
    for (let i = 1; i < ls.length; i++) expect(ls[i]!).toBeLessThan(ls[i - 1]!)
  })
  it('bleibt entsättigt (Tint subtil), auch bei greller Basisfarbe', () => {
    const ramp = generateNeutralRamp('#ff0000')!
    for (const shade of SHADES) {
      expect(rgbToOklch(hexToRgb(ramp[shade])!).c).toBeLessThanOrEqual(0.03)
    }
  })
  it('übernimmt den Hue der Basisfarbe (mittlere Stufen)', () => {
    const baseHue = rgbToOklch(hexToRgb('#2f7fee')!).h
    const ramp = generateNeutralRamp('#2f7fee')!
    const hue500 = rgbToOklch(hexToRgb(ramp[500])!).h
    // Toleranz: sehr niedriges Chroma macht den Hue numerisch instabil
    const diff = Math.abs(((hue500 - baseHue + 540) % 360) - 180)
    expect(diff).toBeLessThan(15)
  })
  it('ungültige Farbe → null', () => {
    expect(generateNeutralRamp('kaputt')).toBeNull()
  })
})

describe('customThemeCss mit Tinted Neutral', () => {
  it("config.neutral 'tinted' → zusätzlicher data-neutral-Block", () => {
    const css = customThemeCss({ id: 'abc123', name: 'T', primary: '#2f7fee', order: 0, config: { neutral: 'tinted' } })
    expect(css).toContain(`:root[data-neutral='c-abc123']`)
    expect(css).toContain('--ui-color-neutral-500:')
    expect(css).toContain('--ui-color-neutral-950:')
  })
  it('ohne config.neutral → kein data-neutral-Block', () => {
    const css = customThemeCss({ id: 'abc123', name: 'T', primary: '#2f7fee', order: 0 })
    expect(css).not.toContain('data-neutral')
  })
})

describe('customThemeCss mit darkAlias', () => {
  it('default (400) bzw. ohne Angabe → primary-400 im .dark-Block', () => {
    const css = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0 })
    expect(css).toContain('--ui-primary: var(--ui-color-primary-400);')
  })
  it('darkAlias 300/500 → entsprechende Stufe im .dark-Block', () => {
    for (const alias of [300, 500] as const) {
      const css = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: { darkAlias: alias } })
      expect(css).toContain(`.dark[data-theme='c-x'] {\n  --ui-primary: var(--ui-color-primary-${alias});`)
    }
  })
  it('ungültiger darkAlias-Wert fällt auf 400 zurück', () => {
    const css = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: { darkAlias: 999 as unknown as 400 } })
    expect(css).toContain('--ui-color-primary-400);')
  })
  it('font in der Config ändert das CSS nicht (reines data-font-Attribut)', () => {
    const withFont = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: { font: 'editorial' } })
    const without = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: {} })
    expect(withFont).toBe(without)
  })
})

describe('customThemeCss Überschriften-Feintuning', () => {
  it('rendert h1–h6-Block mit Gewicht/Laufweite/Uppercase', () => {
    const css = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: { headingWeight: 700, headingTracking: 1.5, headingUppercase: true } })
    expect(css).toContain(`:root[data-theme='c-x'] h1`)
    expect(css).toContain(`:root[data-theme='c-x'] h6`)
    expect(css).toContain('font-weight: 700;')
    expect(css).toContain('letter-spacing: 1.5px;')
    expect(css).toContain('text-transform: uppercase;')
  })
  it('ohne Feintuning → kein h-Block', () => {
    const css = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: {} })
    expect(css).not.toContain('font-weight: ')
    expect(css).not.toContain('letter-spacing')
    expect(css).not.toContain('text-transform')
  })
  it('ungültige Werte werden verworfen (Tracking 0/out-of-range, krummes Gewicht)', () => {
    const css = customThemeCss({ id: 'x', name: 'X', primary: '#2f7fee', order: 0, config: { headingWeight: 450 as unknown as 400, headingTracking: 99, headingUppercase: false } })
    expect(css).not.toContain('font-weight: ')
    expect(css).not.toContain('letter-spacing')
    expect(css).not.toContain('text-transform')
  })
})
