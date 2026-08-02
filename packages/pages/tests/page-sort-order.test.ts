import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pageUpsertSchema } from '../schemas/page'
import { legalTemplates } from '../shared/legalTemplates'

/**
 * REIHENFOLGE ÜBERLEBT EINE BEARBEITUNG (Audit 2026-08-02).
 *
 * Der Upsert schrieb `sortOrder: body.sortOrder ?? 0` in BEIDE Zweige. Die
 * Dashboard-Seite sendet das Feld nie (sie hat kein Bedienelement dafür) —
 * jede Korrektur setzte die Reihenfolge also still auf 0. Getroffen hat es
 * genau die Seiten, für die es gedacht war: `seedLegalPages` stempelt
 * Impressum/Datenschutz auf 90/91, damit sie ans ENDE der Navigation rutschen.
 * Nach der ersten Bearbeitung standen sie vorn, ohne Weg zurück.
 */
const source = readFileSync(
  fileURLToPath(new URL('../server/api/pages/index.put.ts', import.meta.url)),
  'utf8',
)

describe('Upsert einer Seite', () => {
  it('lässt sortOrder beim AKTUALISIEREN unangetastet, wenn es fehlt', () => {
    // Der Rückfall auf 0 darf im gemeinsamen `data`-Objekt nicht mehr stehen —
    // von dort aus erreichte er auch den Update-Zweig.
    expect(source).not.toMatch(/^\s*sortOrder: body\.sortOrder \?\? 0,$/m)
    expect(source).toContain('body.sortOrder === undefined ? {} : { sortOrder: body.sortOrder }')
  })

  it('setzt beim ANLEGEN weiterhin einen Wert — die Spalte ist required', () => {
    expect(source).toContain('sortOrder: body.sortOrder ?? 0')
  })

  it('das Schema lässt das Feld bewusst weg-lassen (deshalb ist der Fall echt)', () => {
    const parsed = pageUpsertSchema.parse({
      slug: 'imprint',
      locale: 'de',
      title: 'Impressum',
      body: 'x',
      status: 'published',
    })
    expect(parsed.sortOrder).toBeUndefined()
  })

  it('die Rechtstexte verlassen sich darauf — sie stehen bewusst hinten', () => {
    // Wären alle Vorlagen auf 0, hätte der Fehler nie jemandem wehgetan; der
    // Test hält fest, warum er es tat.
    expect(legalTemplates('de').some(template => template.sortOrder > 0)).toBe(true)
  })
})
