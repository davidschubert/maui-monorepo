import { describe, expect, it } from 'vitest'
import { customFontAttr, customFontCss } from '../shared/fonts'

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
