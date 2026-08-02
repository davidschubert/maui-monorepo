import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * SEITEN SIND INHALT (F17, 2026-08-01).
 *
 * Beide Schreib-Routen brauchen den Admin-Client aus einem technischen Grund:
 * `pages`-Rows tragen bewusst GAR KEINE Row-Permissions (Entwürfe sind
 * server-only, die öffentliche Route filtert auf `published`), ein
 * Session-Client könnte dort also nichts schreiben. Gehandelt hat trotzdem die
 * Redaktion der Community — vor dieser Durchsicht liefen beide an der
 * Inhalts-Sperre (M13) und am Beitritts-Auslöser (A5) vorbei.
 *
 * Die Abgrenzung zur Owner-EINSTELLUNG ist hier besonders leicht zu verwechseln,
 * weil die Seiten im Dashboard neben den Einstellungen stehen: Impressum, AGB
 * und die eigenen Seiten sind das, was Besucher LESEN. Farbe, Publikum und
 * Registrierung sind es nicht — die bleiben offen.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const routes: Array<[string, string]> = [
  ['Seite speichern (upsert)', read('../server/api/pages/index.put.ts')],
  ['Seite löschen', read('../server/api/pages/[slug].delete.ts')],
]

describe('Seiten-Verwaltung handelt als Redaktion, nicht als Betreiber', () => {
  it.each(routes)('%s: reicht den Handelnden aus dem Gate durch', (_label, source) => {
    expect(source).toContain('{ as: \'operator\', actor }')
    expect(source).toMatch(/const \{[^}]*\bactor\b[^}]*\} = await requireCommunityPermission\(/)
  })

  it.each(routes)('%s: setzt den Handelnden nirgends fest', (_label, source) => {
    // Hartkodiertes 'member' wäre der Fehler, den die Durchsicht vermeiden
    // wollte: der Betreiber im Break-Glass würde damit Mitglied der
    // Kunden-Community.
    expect(source).not.toContain('actor: \'member\'')
    expect(source).not.toContain('actor: \'operator\'')
  })
})

describe('die Lese-Wege bleiben unberührt', () => {
  it.each([
    ['öffentliche Seite', read('../server/api/pages/public/[slug].get.ts')],
    ['öffentliche Liste', read('../server/api/pages/public/index.get.ts')],
    ['Verwaltungs-Liste', read('../server/api/pages/index.get.ts')],
  ])('%s: liest weiterhin über die Operator-Klinke, ohne Handelnden', (_label, source) => {
    expect(source).toContain('{ as: \'operator\' }')
    expect(source).not.toContain('actor')
  })
})
