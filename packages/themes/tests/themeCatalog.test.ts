import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { THEME_CATALOG } from '../theme.catalog'
import { GENERATED_THEMES } from '../app/utils/themeRegistry.gen'

/**
 * Guard für den 26×11-Vollausbau (Plan Schritt 5): der Katalog und die
 * daraus generierte Registry müssen die beschlossene Matrix exakt erfüllen —
 * 26 Farbwelten (E1b: default zählt nicht), je 11 Farbvariationen
 * (E2a: Basis + 10 Varianten), eindeutige IDs, existierende CSS-Dateien.
 * Byte-Aktualität des Generats prüft `pnpm check:themes` (CI); hier stehen
 * die strukturellen Invarianten.
 */
describe('Theme-Katalog 26×11', () => {
  it('umfasst exakt 26 Farbwelten mit je 10 Varianten (Basis + 10 = 11 Stellungen)', () => {
    expect(THEME_CATALOG).toHaveLength(26)
    for (const spec of THEME_CATALOG) {
      expect(spec.variants, `Theme '${spec.id}'`).toHaveLength(10)
    }
  })

  it('hat eindeutige Theme- und (je Theme) Varianten-IDs — und nie "default"', () => {
    const themeIds = THEME_CATALOG.map(spec => spec.id)
    expect(new Set(themeIds).size).toBe(26)
    expect(themeIds).not.toContain('default')
    for (const spec of THEME_CATALOG) {
      const variantIds = spec.variants.map(v => v.id)
      expect(new Set(variantIds).size, `Theme '${spec.id}'`).toBe(variantIds.length)
    }
  })

  it('generierte Registry spiegelt den Katalog (IDs, Reihenfolge, file-Referenzen existieren)', () => {
    expect(GENERATED_THEMES.map(t => t.id)).toEqual(THEME_CATALOG.map(spec => spec.id))
    for (const theme of GENERATED_THEMES) {
      expect(theme.file).toBe(`/themes/${theme.id}.css`)
      expect(existsSync(resolve(__dirname, '..', 'public', 'themes', `${theme.id}.css`)), theme.file!).toBe(true)
      expect(theme.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(theme.variants).toHaveLength(10)
      for (const variant of theme.variants) {
        expect(variant.color, `${theme.id}/${variant.id}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('Varianten-Farben sind je Theme unterscheidbar (inkl. Basis)', () => {
    for (const theme of GENERATED_THEMES) {
      const colors = [theme.color, ...theme.variants.map(v => v.color)]
      expect(new Set(colors).size, `Theme '${theme.id}'`).toBe(colors.length)
    }
  })
})
