import { describe, expect, it } from 'vitest'
import {
  isDisplayableReportUrl,
  normalizeReportedHost,
  normalizeReportedUrl,
  projectAbuseReport,
  summarizeAbuseReports,
  type AbuseReportRow,
  type AbuseReportView,
} from '../shared/abuseReports'
import { REPORTER_EMAIL_RETENTION_DAYS, shouldEraseReporterEmail } from '../server/utils/abuseReportPrune'

/** Die puren Teile der Missbrauchs-Warteschlange (M13, Auslöser 3). */

function row(overrides: Partial<AbuseReportRow> = {}): AbuseReportRow {
  return {
    $id: 'r1',
    $createdAt: '2026-08-02T10:00:00.000Z',
    $updatedAt: '2026-08-02T10:00:00.000Z',
    $permissions: [],
    $sequence: 1,
    $tableId: 'abuse_reports',
    $databaseId: 'db',
    host: 'beispiel.pukalani.app',
    communityId: 'c1',
    communityName: 'Beispiel',
    category: 'spam',
    message: 'Da wird massenhaft Werbung gepostet.',
    url: '',
    reporterEmail: '',
    status: 'open',
    handledBy: '',
    handledAt: null,
    note: '',
    ...overrides,
  } as AbuseReportRow
}

describe('normalizeReportedHost', () => {
  it('nimmt einen vollständigen Link und gibt den Host zurück', () => {
    expect(normalizeReportedHost('https://Beispiel.Pukalani.App/beitrag/3?x=1'))
      .toBe('beispiel.pukalani.app')
  })

  it('räumt Leerzeichen, Port und Schlusspunkt weg', () => {
    expect(normalizeReportedHost('  beispiel.pukalani.app:3000  ')).toBe('beispiel.pukalani.app')
    expect(normalizeReportedHost('beispiel.pukalani.app.')).toBe('beispiel.pukalani.app')
  })

  it('gibt "" zurück, wenn nichts Host-artiges übrig bleibt', () => {
    for (const input of ['', '   ', 'kein host', 'localhost', 'http://', '-x-.de']) {
      expect(normalizeReportedHost(input), input).toBe('')
    }
  })
})

/**
 * DER LINK AUS DEM FORMULAR (Audit-Befund). Diese Werte landen ungefragt in
 * einer Oberfläche, die nur jemand mit `sites.manage` öffnet — die Liste unten
 * ist deshalb keine Stilfrage, sondern die Angriffsfläche selbst.
 */
describe('isDisplayableReportUrl / normalizeReportedUrl', () => {
  it('lässt gewöhnliche Web-Links durch', () => {
    for (const input of [
      'https://beispiel.pukalani.app/beitrag/3',
      'http://beispiel.pukalani.app',
      'HTTPS://BEISPIEL.PUKALANI.APP/Pfad?x=1#y',
      'https://beispiel.pukalani.app:8443/tief/verschachtelt',
    ]) {
      expect(isDisplayableReportUrl(input), input).toBe(true)
      expect(normalizeReportedUrl(input), input).not.toBe('')
    }
  })

  it('weist ausführbare Schemata ab — auch in krummer Schreibung', () => {
    for (const input of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'JAVASCRIPT:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'DATA:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'VBScript:MsgBox(1)',
      'file:///etc/passwd',
    ]) {
      expect(isDisplayableReportUrl(input), input).toBe(false)
      expect(normalizeReportedUrl(input), input).toBe('')
    }
  })

  it('durchschaut Leerzeichen- und Steuerzeichen-Tricks', () => {
    // Browser entfernen \t\r\n ÜBERALL in einer URL und führenden C0-Leerraum,
    // BEVOR sie das Schema lesen — `java\nscript:` ist für sie `javascript:`.
    // Eine Prüfung, die das nicht nachmacht, prüft einen anderen String als der,
    // der später geklickt wird.
    for (const input of [
      '  javascript:alert(1)',
      '\tjavascript:alert(1)',
      '\njavascript:alert(1)',
      'java\nscript:alert(1)',
      'java\tscript:alert(1)',
      'java\r\nscript:alert(1)',
      'j\ta\nv\ra\ts\nc\rr\ti\np\rt:alert(1)',
      '\u0000javascript:alert(1)',
      ' \u0001 javascript:alert(1)',
    ]) {
      expect(isDisplayableReportUrl(input), JSON.stringify(input)).toBe(false)
      expect(normalizeReportedUrl(input), JSON.stringify(input)).toBe('')
    }
  })

  it('putzt harmlosen Leerraum weg, statt den Link zu verwerfen', () => {
    expect(normalizeReportedUrl('  https://beispiel.pukalani.app/x  ')).toBe('https://beispiel.pukalani.app/x')
    expect(normalizeReportedUrl('https://beispiel.pukalani.app/\tx')).toBe('https://beispiel.pukalani.app/x')
  })

  it('verwirft, was gar kein absoluter Link ist', () => {
    for (const input of ['', '   ', '/beitrag/3', '//fremd.example/x', 'beispiel.pukalani.app', 'kein link']) {
      expect(isDisplayableReportUrl(input), input).toBe(false)
      expect(normalizeReportedUrl(input), input).toBe('')
    }
  })
})

describe('projectAbuseReport', () => {
  it('reicht die Meldung als Ansicht durch', () => {
    const view = projectAbuseReport(row())
    expect(view.id).toBe('r1')
    expect(view.host).toBe('beispiel.pukalani.app')
    expect(view.category).toBe('spam')
    expect(view.status).toBe('open')
  })

  it('macht aus null überall ""', () => {
    const view = projectAbuseReport(row({ communityId: null, communityName: null, url: null, reporterEmail: null, note: null }))
    expect(view.communityId).toBe('')
    expect(view.communityName).toBe('')
    expect(view.url).toBe('')
    expect(view.note).toBe('')
  })

  it('nimmt die Melder-Adresse NICHT in den Umschlag (PII ohne Leser)', () => {
    // Die Warteschlange rendert sie nirgends. Eine E-Mail-Adresse, die in jeden
    // Browser reist, ohne dort gebraucht zu werden, ist reines Risiko.
    const view = projectAbuseReport(row({ reporterEmail: 'melder@example.test' }))
    expect(Object.keys(view)).not.toContain('reporterEmail')
    expect(JSON.stringify(view)).not.toContain('melder@example.test')
  })

  it('reicht den Link roh durch — die Anzeige entscheidet, nicht die Projektion', () => {
    // `url` ist BELEG: eine Bestandszeile aus der Zeit vor der Eingangs-
    // Normalisierung soll lesbar bleiben, auch wenn sie nie klickbar wird.
    const view = projectAbuseReport(row({ url: 'javascript:alert(1)' }))
    expect(view.url).toBe('javascript:alert(1)')
    expect(isDisplayableReportUrl(view.url)).toBe(false)
  })

  it('fällt bei krummen Spaltenwerten auf other/open zurück statt zu verschwinden', () => {
    // Eine Meldung, die wegen eines Tippfehlers in der Spalte unsichtbar wird,
    // ist der teuerste Fehler, den diese Warteschlange machen kann.
    const view = projectAbuseReport(row({ category: 'unfug', status: 'unfug' }))
    expect(view.category).toBe('other')
    expect(view.status).toBe('open')
  })
})

describe('summarizeAbuseReports', () => {
  it('zählt je Zustand und gesamt', () => {
    const views = [
      { status: 'open' }, { status: 'open' }, { status: 'suspended' }, { status: 'dismissed' },
    ] as AbuseReportView[]
    expect(summarizeAbuseReports(views)).toEqual({ open: 2, suspended: 1, dismissed: 1, total: 4 })
  })

  it('bleibt bei leerer Liste bei null', () => {
    expect(summarizeAbuseReports([])).toEqual({ open: 0, suspended: 0, dismissed: 0, total: 0 })
  })
})

/**
 * DIE LÖSCHFRIST FÜR MELDER-ADRESSEN (F8-Rest, Davids Entscheidung
 * 2026-08-02). 90 Tage ab der MELDUNG, nicht ab der Bearbeitung — sonst hinge
 * die Zusage an der Warteschlangen-Disziplin des Betreibers.
 */
describe('shouldEraseReporterEmail', () => {
  const NOW = Date.parse('2026-08-02T12:00:00.000Z')
  const DAY = 24 * 60 * 60 * 1000
  const withAge = (ms: number, email: string | null = 'melder@example.test') =>
    ({ reporterEmail: email, $createdAt: new Date(NOW - ms).toISOString() })

  it('lässt eine frische Meldung in Ruhe', () => {
    expect(shouldEraseReporterEmail(withAge(30 * DAY), NOW)).toBe(false)
  })

  it('löscht genau an der Grenze', () => {
    expect(shouldEraseReporterEmail(withAge(REPORTER_EMAIL_RETENTION_DAYS * DAY), NOW)).toBe(true)
    // Eine Minute davor noch nicht — die Frist ist ein Datum, kein Gefühl.
    expect(shouldEraseReporterEmail(withAge(REPORTER_EMAIL_RETENTION_DAYS * DAY - 60_000), NOW)).toBe(false)
  })

  it('löscht, was älter ist', () => {
    expect(shouldEraseReporterEmail(withAge(400 * DAY), NOW)).toBe(true)
  })

  it('rührt eine anonyme Meldung nicht an — der Status ist egal', () => {
    // '' ist die Spalten-Vorgabe (Migration control-034), null der Zustand nach
    // einem früheren Lauf. Beides heißt „keine Adresse", beides ist fertig.
    expect(shouldEraseReporterEmail(withAge(400 * DAY, ''), NOW)).toBe(false)
    expect(shouldEraseReporterEmail(withAge(400 * DAY, null), NOW)).toBe(false)
  })

  it('löscht NICHT, wenn der Zeitstempel fehlt oder krumm ist', () => {
    // Fail-safe: ein unlesbares Datum als „unendlich alt" zu lesen wäre die
    // teure Richtung des Zweifels.
    expect(shouldEraseReporterEmail({ reporterEmail: 'melder@example.test' }, NOW)).toBe(false)
    expect(shouldEraseReporterEmail({ reporterEmail: 'melder@example.test', $createdAt: '' }, NOW)).toBe(false)
    expect(shouldEraseReporterEmail({ reporterEmail: 'melder@example.test', $createdAt: 'vorgestern' }, NOW)).toBe(false)
  })
})
