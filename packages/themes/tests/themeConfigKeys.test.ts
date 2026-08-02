import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEME_CONFIG_KEYS } from '../shared/ramp'

/**
 * EINE FELDLISTE, DREI ORTE (Audit-Befund 2026-08-02).
 *
 * `ThemeConfig` wächst additiv (das config-JSON trägt bewusst kein `version`).
 * Drei Stellen müssen davon erfahren, und keine meldet sich von selbst:
 *
 *  1. `THEME_CONFIG_KEYS` — die Laufzeit-Liste. Sie ist an den TYP genagelt
 *     (Record<keyof Required<ThemeConfig>, true> in shared/ramp.ts), das
 *     erledigt der Compiler; ein vergessenes Feld ist dort ein Typfehler.
 *  2. Der JSON-Import der Galerie-Seite. Er benutzt die Liste seit dem Audit,
 *     statt sie abzuschreiben — vorher wurde ein neues Feld beim Import STILL
 *     verschluckt (kein Fehler, nur ein Default: das eingeführte Theme sah
 *     anders aus als das exportierte, und niemand wusste warum).
 *  3. Die Editor-Defaults (`DEFAULT_CONFIG` in useThemeDraft.ts). Fehlt ein
 *     Feld dort, hat der Regler keinen Startwert — der Compiler merkt das nur,
 *     solange der Draft-Typ vollständig aus ThemeConfig abgeleitet ist, und er
 *     ist es absichtlich nicht (radius/neutral/font … dürfen dort `null` sein,
 *     was ThemeConfig nicht kennt).
 *
 * Punkt 3 ist deshalb hier am QUELLTEXT geprüft, nicht am Import: `useThemeDraft`
 * ist ein Nuxt-Composable und zöge in einem reinen Unit-Test den halben
 * App-Kontext nach. Das Muster (Quelltext als Anker) steht schon in
 * packages/courses/tests/redaction-actor.test.ts.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('THEME_CONFIG_KEYS ist die eine Feldliste', () => {
  it('ist gefüllt und doppelungsfrei', () => {
    expect(THEME_CONFIG_KEYS.length).toBeGreaterThan(0)
    expect(new Set(THEME_CONFIG_KEYS).size).toBe(THEME_CONFIG_KEYS.length)
  })

  it('der JSON-Import schreibt die Liste NICHT mehr ab', () => {
    const source = read('../app/pages/dashboard/themes/index.vue')
    expect(source).toContain('for (const key of THEME_CONFIG_KEYS)')
    // Die alte, abgeschriebene Liste begann mit diesen beiden Feldern.
    expect(source).not.toMatch(/\['mode', 'anchor'/)
  })

  it('die Editor-Defaults decken jedes Feld ab', () => {
    const source = read('../app/composables/useThemeDraft.ts')
    const literal = /const DEFAULT_CONFIG: ThemeDraftState\['config'\] = \{([^}]*)\}/.exec(source)
    expect(literal, 'DEFAULT_CONFIG nicht gefunden — Anker anpassen').not.toBeNull()
    const defaults = [...literal![1]!.matchAll(/(\w+)\s*:/g)].map(m => m[1]!)
    expect([...defaults].sort()).toEqual([...THEME_CONFIG_KEYS].sort())
  })
})
