import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { coverReadPermissions } from '../shared/coverAudience'

/**
 * EINE DATEI IST NIE OFFENER ALS IHRE ZEILE (F28, 2026-08-02).
 *
 * Die Rechnung ist eine Zeile, aber sie entscheidet, wer das Titelbild eines
 * unveröffentlichten Termins sehen kann. Vier Zustände, und der erste ist der,
 * an dem es zweimal schiefgegangen ist: vor events-009 war ein Entwurfs-Cover
 * für JEDEN im Internet abrufbar (bucket-weites read(any)), danach für jedes
 * MITGLIED der Community (Rückfall auf das Mitglieder-Publikum, damit die
 * Dashboard-Vorschau ein Bild hatte). Jetzt für niemanden — die Vorschau läuft
 * über `GET /api/events/:id/cover`.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const PUBLIC_READ = 'read("any")'
const MEMBERS_READ = 'read("label:c123")'
const OWNER_UPDATE = 'update("user:u1")'

describe('coverReadPermissions — die Datei bekommt das Publikum ihrer Zeile', () => {
  it('Entwurf (Row ohne Leserecht) ⇒ die Datei bekommt KEINES', () => {
    expect(coverReadPermissions([])).toEqual([])
  })

  it('veröffentlicht in einer offenen Community ⇒ read(any)', () => {
    expect(coverReadPermissions([PUBLIC_READ])).toEqual([PUBLIC_READ])
  })

  it('veröffentlicht in einer geschlossenen Community ⇒ read(label:<communityId>)', () => {
    expect(coverReadPermissions([MEMBERS_READ])).toEqual([MEMBERS_READ])
  })

  it('zurückgezogen (Leserecht entfernt, Schreibrechte bleiben) ⇒ die Datei zieht mit', () => {
    expect(coverReadPermissions([OWNER_UPDATE])).toEqual([])
  })

  it('abgesagt: das Publikum bleibt, also bleibt das Bild abrufbar', () => {
    // Ein abgesagter Termin behält sein Leserecht — die Zusagenden müssen die
    // Absage sehen. Die Regel liest deshalb die PERMISSIONS, nie `status`.
    expect(coverReadPermissions([PUBLIC_READ, OWNER_UPDATE])).toEqual([PUBLIC_READ])
  })

  it('nimmt NUR read-Einträge mit — ein update/delete darf nie auf die Datei', () => {
    expect(coverReadPermissions([MEMBERS_READ, OWNER_UPDATE, 'delete("user:u1")']))
      .toEqual([MEMBERS_READ])
  })

  it('fehlende Permissions sind kein Sonderfall (undefined/null ⇒ zu)', () => {
    expect(coverReadPermissions(undefined)).toEqual([])
    expect(coverReadPermissions(null)).toEqual([])
  })
})

describe('die Regel hat genau EINEN Ort', () => {
  it('die Laufzeit rechnet nicht selbst, sondern ruft die pure Regel', () => {
    const source = read('../server/utils/eventCovers.ts')
    expect(source).toContain('coverReadPermissions(row.$permissions)')
    // Der Rückfall auf das Mitglieder-Publikum ist WEG und darf nicht
    // zurückkommen: er war der ganze Befund.
    expect(source).not.toContain('tenantRowPermissions(')
  })

  it('die Vorschau-Route steht hinter Capability UND Datentür', () => {
    const source = read('../server/api/events/[id]/cover.get.ts')
    expect(source).toContain('await requireCommunityPermission(event, \'events.manage\')')
    expect(source).toContain('tenantDb(event, { as: \'operator\' })')
    // Die fileId kommt aus der GEPRÜFTEN Row, nie aus der URL — sonst liefe
    // die Zugehörigkeitsprüfung ins Leere.
    expect(source).toContain('fileId: row.coverFileId')
    expect(source).not.toMatch(/getRouterParam\(event, 'fileId'\)/)
  })
})
