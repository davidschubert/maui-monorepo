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
    // Die Ausnahmen werden an EINER Stelle geführt (F26): seit dem 2026-08-02
    // sind es zwei, und die zweite (RSVP zurückziehen) muss dort benannt sein —
    // sonst beruft sich der nächste Weg auf eine Liste, die ihn nicht kennt.
    expect(source).toMatch(/DIE LISTE DER AUSNAHMEN, VOLLSTÄNDIG/)
    expect(source).toMatch(/rsvp\.post\.ts/)
  })
})

/**
 * RSVP: NACH RICHTUNG GETRENNT (F26, Entscheidung vom 2026-08-02).
 *
 * Zusagen und Zurückziehen sind derselbe Aufruf mit demselben Body — sie
 * unterscheiden sich nur am Bestand. Deshalb hängt hier alles an zwei Türen in
 * EINER Datei, und ein Zusammenführen „zur Vereinfachung" würde das
 * Zurückziehen in einer gesperrten Community wieder unmöglich machen, ohne dass
 * irgendetwas rot wird. Diese Tests sind der Anker dagegen.
 */
describe('RSVP: Zusage gesperrt, Rücknahme offen', () => {
  const source = read('../server/api/events/[id]/rsvp.post.ts')

  it('der Zusage-Weg handelt als Mitglied (und fällt damit unter die Sperre)', () => {
    expect(source).toContain('tenantDb(event, { as: \'operator\', actor: \'member\' })')
  })

  it('die Rücknahme hat eine EIGENE Tür ohne Handelnden', () => {
    expect(source).toContain('const withdrawDb = tenantDb(event, { as: \'operator\' })')
  })

  it('der Zähler folgt der Rücknahme durch dieselbe Tür', () => {
    // Ginge das Dekrement über `db`, stünde die Zusage gelöscht da, während
    // attendeeCount den Platz weiter belegt hielte — die Sperre bräche mitten
    // im Vorgang ab.
    expect(source).toMatch(/withdrawDb\.decrement\(EVENTS_TABLE, id, 'attendeeCount'/)
  })

  it('die Ausnahme bleibt eng: kein zweiter offener Schreibweg in der Datei', () => {
    // Genau EINE türlose Datentür. Wer eine zweite ergänzt (etwa für den
    // Wechsel going → declined), macht aus der Ausnahme eine Regel.
    expect(source.match(/tenantDb\(event, \{ as: 'operator' \}\)/g)).toHaveLength(1)
  })

  it('die Begründung steht an der Stelle', () => {
    expect(source).toMatch(/RÜCKNAHME/)
    expect(source).toMatch(/F26/)
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

  /**
   * ABER: „kein Handelnder" heißt NICHT „läuft in einer gesperrten Community
   * weiter" (F25, Entscheidung vom 2026-08-02). Die Serien-Expansion legt neue
   * Zeilen an und verbraucht Kontingent — genau das, was die Zahlungssperre
   * meint. Weil sie ohne `actor` läuft, greift die Inhalts-Sperre der Datentür
   * nicht; sie muss also selbst fragen.
   */
  it('Serien-Expansion hält in einer gesperrten Community an — VOR dem Marker', () => {
    const source = read('../server/utils/eventSeries.ts')
    expect(source).toContain('memberWritesAllowedFor(db.tenant)')
    expect(source).toContain('events.series_expansion_suspended')

    // Reihenfolge ist die eigentliche Zusage: stünde die Prüfung hinter dem
    // `seriesGeneratedUntil`-Marker, hielte der das Fenster für erledigt und
    // die Serie bekäme nach dem Entsperren ein Loch, das nie wieder auffällt.
    expect(source.indexOf('memberWritesAllowedFor(db.tenant)'))
      .toBeLessThan(source.indexOf('seriesGeneratedUntil: new Date('))
  })
})
