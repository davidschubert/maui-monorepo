import { describe, it, expect } from 'vitest'
import {
  BRAND_MARK_FALLBACK_COLOR,
  brandFaviconSvg,
  brandInkColor,
  resolveBrandColor,
  type BrandThemeEntry,
} from '../shared/brandMark'

const THEMES: BrandThemeEntry[] = [
  { id: 'default', color: '#737373', variants: [] },
  { id: 'crimson', color: '#ff2357', variants: [{ id: 'deep', color: '#d00041' }] },
  { id: 'c-abc123', color: '#0055ff', variants: [] },
]

describe('resolveBrandColor', () => {
  it('nimmt die Basisfarbe des voreingestellten Themes', () => {
    expect(resolveBrandColor(THEMES, 'crimson')).toBe('#ff2357')
  })

  it('nimmt die Variantenfarbe, wenn das Theme sie kennt', () => {
    expect(resolveBrandColor(THEMES, 'crimson', 'deep')).toBe('#d00041')
  })

  it('ignoriert eine Variante, die zum Theme nicht gehört', () => {
    expect(resolveBrandColor(THEMES, 'crimson', 'pastel')).toBe('#ff2357')
  })

  it('löst Custom Themes über das data-theme-Attribut auf', () => {
    expect(resolveBrandColor(THEMES, 'c-abc123')).toBe('#0055ff')
  })

  it('fällt ohne/mit unbekannter Theme-Id auf den Core-Default zurück', () => {
    expect(resolveBrandColor(THEMES, undefined)).toBe('#737373')
    expect(resolveBrandColor(THEMES, 'geloescht')).toBe('#737373')
  })

  it('fällt auf die Konstante zurück, wenn nicht einmal ein Default existiert', () => {
    expect(resolveBrandColor([], 'crimson')).toBe(BRAND_MARK_FALLBACK_COLOR)
  })
})

describe('brandInkColor', () => {
  it('nutzt Weiß auf kräftigen/dunklen Basisfarben', () => {
    expect(brandInkColor('#ff2357')).toBe('#ffffff')
    expect(brandInkColor('#0055ff')).toBe('#ffffff')
    expect(brandInkColor('#737373')).toBe('#ffffff')
  })

  it('wechselt auf dunkle Tinte, wo Weiß verschwinden würde (helle Gelbtöne)', () => {
    // Citrus/Honey aus dem 26er-Katalog liegen im hellen Bereich
    expect(brandInkColor('#f6d100')).toBe('#1c1917')
    expect(brandInkColor('#ffffff')).toBe('#1c1917')
  })

  it('bleibt bei unbrauchbaren Werten bei Weiß statt zu werfen', () => {
    expect(brandInkColor('nicht-hex')).toBe('#ffffff')
  })
})

describe('brandFaviconSvg', () => {
  it('rendert Kreis in der Markenfarbe und EIN Initial', () => {
    const svg = brandFaviconSvg('#ff2357', 'MO')
    expect(svg).toContain('<svg')
    expect(svg).toContain('fill="#ff2357"')
    expect(svg).toContain('>M<')
    expect(svg).not.toContain('>MO<')
  })

  it('lässt den Text weg, wenn keine Initiale bestimmbar ist', () => {
    expect(brandFaviconSvg('#ff2357', '')).not.toContain('<text')
  })

  it('ist Code-Point-sicher (Emoji/CJK werden nicht halbiert)', () => {
    expect(brandFaviconSvg('#ff2357', '李')).toContain('>李<')
  })

  it('escaped Kundennamen (kein XML-Ausbruch aus dem Text-Knoten)', () => {
    const svg = brandFaviconSvg('#ff2357', '<')
    expect(svg).toContain('&lt;')
    expect(svg).not.toContain('><<')
  })
})
