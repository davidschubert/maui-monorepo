import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * TERMIN-VERWALTUNG IST REDAKTION (F17, 2026-08-01).
 *
 * Die sechs Verwaltungs-Routen brauchen den Admin-Client aus einem technischen
 * Grund (Event-Rows tragen nur Leserechte, geschrieben wird server-seitig).
 * Gehandelt hat dort ein Mensch DIESER Community — vor dieser Durchsicht
 * meldeten sich damit alle sechs still von der Inhalts-Sperre (M13) und vom
 * Beitritts-Auslöser (A5) ab.
 *
 * ABGRENZUNG, die hier mitgeprüft wird: die Serien-Expansion und der
 * Reminder-Sweep sind KEINE Redaktion. Beide laufen aus einem beliebigen
 * Lese-Request (auch dem eines Gastes) und schreiben auf fremden Zeilen — ein
 * `actor` dort machte jeden Vorbeisurfer zum Mitglied.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const routes: Array<[string, string]> = [
  ['Termin anlegen', read('../server/api/events/index.post.ts')],
  ['Termin bearbeiten/veröffentlichen', read('../server/api/events/[id].patch.ts')],
  ['Termin absagen', read('../server/api/events/[id].delete.ts')],
  ['Serie beenden', read('../server/api/events/[id]/series.delete.ts')],
  ['Titelbild setzen', read('../server/api/events/[id]/cover.post.ts')],
  ['Titelbild entfernen', read('../server/api/events/[id]/cover.delete.ts')],
]

describe('Termin-Verwaltung handelt als Redaktion, nicht als Betreiber', () => {
  it.each(routes)('%s: reicht den Handelnden aus dem Gate durch', (_label, source) => {
    expect(source).toContain('{ as: \'operator\', actor }')
    expect(source).toMatch(/const \{[^}]*\bactor\b[^}]*\} = await requireCommunityPermission\(/)
  })

  it.each(routes)('%s: setzt den Handelnden nirgends fest', (_label, source) => {
    expect(source).not.toContain('actor: \'member\'')
    expect(source).not.toContain('actor: \'operator\'')
  })

  it('ABSAGEN zählt bewusst mit — und die Begründung steht an der Stelle', () => {
    // Der eine strittige Fall der Durchsicht: eine Absage schützt die
    // Zusagenden, die mit der offenen Rechnung nichts zu tun haben. Entschieden
    // wurde trotzdem für die Sperre (eine Absage ist eine neue Aussage an alle
    // Teilnehmer, keine Rücknahme). Wer das dreht, muss die Begründung ersetzen,
    // nicht löschen.
    const source = read('../server/api/events/[id].delete.ts')
    expect(source).toMatch(/strittige Fall/)
  })
})

describe('Sweeps sind keine Redaktion', () => {
  it.each([
    ['Serien-Expansion', read('../server/utils/eventSeries.ts')],
    ['Reminder-Sweep', read('../server/utils/eventReminders.ts')],
  ])('%s: kein Handelnder, mit Begründung', (_label, source) => {
    expect(source).toContain('WER HANDELT (F17)')
    // Geprüft wird die AUFRUFSTELLE, nicht das Wort — die Begründung im Kopf
    // nennt den Parameter natürlich.
    expect(source).not.toContain('tenantDb(event, { as: \'operator\', actor')
  })
})
