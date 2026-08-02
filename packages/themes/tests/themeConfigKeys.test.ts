import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { THEME_CONFIG_KEYS } from '../shared/ramp'

/**
 * EINE FELDLISTE, VIER ORTE (Audit-Befund 2026-08-02, erweitert am 2026-08-02
 * um den vierten — F31).
 *
 * `ThemeConfig` wächst additiv (das config-JSON trägt bewusst kein `version`).
 * Vier Stellen müssen davon erfahren, und keine meldet sich von selbst:
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
 *  4. Die strikte Zod-Prüfung der beiden Speicher-Routen im ADMIN-Layer
 *     (`themeConfigSchema` in admin/server/api/admin/themes/index.post.ts und
 *     [id].patch.ts — dort steht sie zweimal wörtlich). Sie ist `.strict()`:
 *     ein Feld, das die Liste kennt und das Schema nicht, lässt nicht nur
 *     dieses Feld fallen, sondern weist den GANZEN Speichervorgang mit 400 ab.
 *     Das ist die einzige der vier Stellen, an der ein Auseinanderlaufen den
 *     Editor unbenutzbar macht.
 *
 * WARUM QUELLTEXT UND NICHT EIN GETEILTES SCHEMA (F31, entschieden 2026-08-02):
 * ein gemeinsames Zuhause für das Schema gibt es nicht, ohne die A14-Grenze
 * aufzuweichen. `packages/themes/**` darf laut eslint.config.mjs KEIN
 * `@pukalani/*` importieren (auch core/system nicht — themes ist rein visuell),
 * und `packages/admin/**` darf keinen anderen Feature-Layer importieren, also
 * auch nicht `@pukalani/themes`. Beide Richtungen sind gesperrt; ein Export aus
 * themes wäre erst nach einer bewussten Änderung der Layer-Matrix möglich, und
 * das ist eine Architektur-Entscheidung, keine Aufräumarbeit. Der Quelltext-
 * Anker hält die vierte Stelle solange fest, ohne irgendeine Grenze zu
 * verschieben — er liest die Datei, er importiert sie nicht.
 *
 * Punkt 3 und 4 sind deshalb hier am QUELLTEXT geprüft, nicht am Import:
 * `useThemeDraft` ist ein Nuxt-Composable und zöge in einem reinen Unit-Test
 * den halben App-Kontext nach, und die Admin-Routen sind Nitro-Handler mit
 * Auto-Imports. Das Muster (Quelltext als Anker) steht schon in
 * packages/events/tests/redaction-actor.test.ts.
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

/**
 * DIE VIERTE STELLE: die Speicher-Routen im admin-Layer.
 *
 * Gelesen wird der Quelltext, nicht das Schema — siehe die Begründung im Kopf
 * dieser Datei (A14 sperrt beide Import-Richtungen). Geprüft werden die
 * SCHLÜSSEL, nicht die Wertebereiche: welcher Bereich für `hueShift` gilt, ist
 * eine Produktfrage, die an genau einer Stelle beantwortet gehört. Ob ein Feld
 * dem Schema überhaupt BEKANNT ist, ist dagegen eine Ja/Nein-Tatsache, und nur
 * die kann hier auseinanderlaufen.
 */
const ADMIN_ROUTES: Array<[string, string]> = [
  ['Theme anlegen', '../../admin/server/api/admin/themes/index.post.ts'],
  ['Theme bearbeiten', '../../admin/server/api/admin/themes/[id].patch.ts'],
]

function adminSchemaKeys(source: string): string[] {
  const block = /const themeConfigSchema = z\.object\(\{\n([\s\S]*?)\n\}\)\.strict\(\)/.exec(source)
  expect(block, 'themeConfigSchema nicht gefunden — Anker anpassen (Name oder .strict() geändert?)').not.toBeNull()
  // Nur die oberste Ebene: Verschachteltes (z.enum-Listen, Regexe) steht tiefer eingerückt.
  return [...block![1]!.matchAll(/^ {2}(\w+):/gm)].map(m => m[1]!)
}

describe('die strikte Zod-Prüfung im admin-Layer kennt jedes Feld', () => {
  it.each(ADMIN_ROUTES)('%s: Schlüssel deckungsgleich mit THEME_CONFIG_KEYS', (_label, relative) => {
    // Fehlt hier ein Feld, weist `.strict()` den ganzen Speichervorgang mit 400
    // ab — der Editor lässt sich dann gar nicht mehr speichern, nicht nur der
    // eine Regler. Steht hier eines ZU VIEL, hat jemand ein Feld aus
    // ThemeConfig entfernt und die Route vergessen: sie nimmt dann Werte an,
    // die nichts mehr rendert.
    expect(adminSchemaKeys(read(relative)).sort()).toEqual([...THEME_CONFIG_KEYS].sort())
  })

  it('beide Routen prüfen wörtlich dasselbe Schema', () => {
    // Die Kopie ist Absicht (admin darf themes nicht importieren), aber sie
    // muss eine KOPIE bleiben. Eine Route, die ein Feld kennt und die andere
    // nicht, hieße: anlegen geht, bearbeiten wirft 400.
    const [first, second] = ADMIN_ROUTES.map(([, relative]) => adminSchemaKeys(read(relative)))
    expect(first).toEqual(second)
  })

  it('das Schema bleibt strikt', () => {
    // Ohne `.strict()` verschwände ein unbekanntes Feld beim Speichern still —
    // dann wäre dieser Test grün und das Theme trotzdem falsch gespeichert.
    for (const [, relative] of ADMIN_ROUTES) {
      expect(read(relative)).toContain('}).strict()')
    }
  })
})
