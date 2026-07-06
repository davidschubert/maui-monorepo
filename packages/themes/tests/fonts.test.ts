import { describe, expect, it } from 'vitest'
import { customFontAttr, customFontCss } from '../shared/fonts'
import { resolveThemeFonts } from '../app/utils/themeRegistry'

const url = (fileId: string) => `https://appwrite.example/v1/storage/buckets/fonts/files/${fileId}/view?project=p`

describe('customFontAttr', () => {
  it('prefixt kollisionsfrei mit cf-', () => {
    expect(customFontAttr('abc123')).toBe('cf-abc123')
  })
})

describe('customFontCss', () => {
  it('rendert @font-face je Datei + data-font-Block', () => {
    const css = customFontCss({
      id: 'abc123',
      name: 'Meine Hausschrift',
      order: 0,
      files: [
        { weight: 400, fileId: 'f400' },
        { weight: 700, fileId: 'f700' },
      ],
    }, url)
    expect(css.match(/@font-face/g)).toHaveLength(2)
    expect(css).toContain(`font-family: 'Meine Hausschrift';`)
    expect(css).toContain(`src: url('${url('f400')}') format('woff2');`)
    expect(css).toContain('font-weight: 400;')
    expect(css).toContain('font-weight: 700;')
    expect(css).toContain(`:root[data-font='cf-abc123']`)
    expect(css).toContain(`--font-sans: 'Meine Hausschrift', ui-sans-serif, system-ui, sans-serif;`)
    expect(css).toContain('font-display: swap;')
  })

  it('variable Font → Gewichtsbereich 100 900', () => {
    const css = customFontCss({
      id: 'x', name: 'Vari', order: 0,
      files: [{ weight: 400, fileId: 'fv', variable: true }],
    }, url)
    expect(css).toContain('font-weight: 100 900;')
    expect(css).not.toContain('font-weight: 400;')
  })

  it('ohne Dateien → leerer String', () => {
    expect(customFontCss({ id: 'x', name: 'Leer', order: 0, files: [] }, url)).toBe('')
  })
})

describe('customFontCss Injection-Härtung (Spiegel der admin-Zod-Allowlist)', () => {
  const files = [{ weight: 400, fileId: 'f400' }]

  it('Name mit Quote/</style>/Klammern → fail closed (kein CSS)', () => {
    expect(customFontCss({ id: 'x', name: `Evil'; } </style><script>`, order: 0, files }, url)).toBe('')
    expect(customFontCss({ id: 'x', name: 'a} :root{--pwn:1', order: 0, files }, url)).toBe('')
    expect(customFontCss({ id: 'x', name: `a\\`, order: 0, files }, url)).toBe('')
  })

  it('ungültige Row-ID → fail closed', () => {
    expect(customFontCss({ id: `x'] body`, name: 'Ok', order: 0, files }, url)).toBe('')
  })

  it('ungültige fileId/weight → nur diese Datei fällt raus', () => {
    const css = customFontCss({
      id: 'x',
      name: 'Ok',
      order: 0,
      files: [
        { weight: 400, fileId: 'f400' },
        { weight: 700, fileId: `f') url('//evil` },
        { weight: Number.NaN, fileId: 'f900' },
      ],
    }, url)
    expect(css.match(/@font-face/g)).toHaveLength(1)
    expect(css).toContain('f400')
    expect(css).not.toContain('evil')
  })

  it('regulärer Name (Leerzeichen, Bindestrich, gemischt) bleibt erlaubt', () => {
    expect(customFontCss({ id: 'x', name: 'PT Sans-Narrow_2', order: 0, files }, url)).toContain(`font-family: 'PT Sans-Narrow_2';`)
  })
})

describe('customFontCss Rollen-Blöcke', () => {
  it('rendert Text- UND Überschriften-Block', () => {
    const css = customFontCss({ id: 'x', name: 'Hausschrift', order: 0, files: [{ weight: 400, fileId: 'f' }] }, url)
    expect(css).toContain(`:root[data-font='cf-x']`)
    expect(css).toContain(`:root[data-font-heading='cf-x'] h1`)
    expect(css).toContain(`:root[data-font-heading='cf-x'] h6`)
  })
})

describe('resolveThemeFonts (Legacy-Paar-Mapping)', () => {
  it('mappt v1-Paare auf Text-/Überschriften-Rollen', () => {
    expect(resolveThemeFonts({ font: 'editorial' })).toEqual({ font: 'source-sans', fontHeading: 'source-serif' })
    expect(resolveThemeFonts({ font: 'classic' })).toEqual({ font: 'pt-sans', fontHeading: 'pt-serif' })
    expect(resolveThemeFonts({ font: 'humanist' })).toEqual({ font: 'source-sans', fontHeading: undefined })
  })
  it('reicht neue Familien-Ids und cf-Ids unverändert durch', () => {
    expect(resolveThemeFonts({ font: 'sora', fontHeading: 'pt-serif' })).toEqual({ font: 'sora', fontHeading: 'pt-serif' })
    expect(resolveThemeFonts({ font: 'cf-abc' })).toEqual({ font: 'cf-abc', fontHeading: undefined })
    expect(resolveThemeFonts(undefined)).toEqual({ font: undefined, fontHeading: undefined })
  })
  it('inter bleibt inter (Paar-Id = Familien-Id)', () => {
    expect(resolveThemeFonts({ font: 'inter' })).toEqual({ font: 'inter', fontHeading: undefined })
  })
})
