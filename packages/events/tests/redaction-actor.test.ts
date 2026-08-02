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
  ['Titelbild setzen', read('../server/api/events/[id]/cover.post.ts')],
  ['Titelbild entfernen', read('../server/api/events/[id]/cover.delete.ts')],
]

/**
 * ABSAGEN IST DIE AUSNAHME (Davids Entscheidung 2026-08-02) — deshalb stehen
 * diese zwei Routen NICHT in der Liste oben: sie reichen den Handelnden
 * bewusst nicht durch, damit eine Absage auch in einer billing-gesperrten
 * Community durchgeht (sie schützt die Zusagenden, und die haben mit der
 * Rechnung ihres Owners nichts zu tun).
 */
const cancelRoutes: Array<[string, string]> = [
  ['Termin absagen', read('../server/api/events/[id].delete.ts')],
  ['Serie beenden', read('../server/api/events/[id]/series.delete.ts')],
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

  it.each(cancelRoutes)('%s: reicht den Handelnden bewusst NICHT durch', (_label, source) => {
    // Die Gegenrichtung, absichtlich als eigener Anker: wer hier später „der
    // Vollständigkeit halber" ein `actor` ergänzt, macht Absagen in einer
    // gesperrten Community unmöglich — und das ist genau die Wirkung, gegen die
    // David entschieden hat. Der Test soll dann rot werden, nicht der Kunde
    // vor verschlossener Tür stehen.
    expect(source).not.toContain('{ as: \'operator\', actor }')
    expect(source).not.toContain('actor: \'member\'')
  })

  it('die Begründung der Ausnahme steht an der Stelle, nicht nur im Protokoll', () => {
    // Wer die Entscheidung dreht, muss die Begründung ERSETZEN, nicht löschen:
    // die überstimmten Gegenargumente stehen im Kopf und verhindern, dass sie
    // beim nächsten Mal neu erfunden werden.
    const source = read('../server/api/events/[id].delete.ts')
    expect(source).toMatch(/Absagen bleibt OFFEN/)
    expect(source).toMatch(/AUSSCHLIESSLICH fürs Absagen/)
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
