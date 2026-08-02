import { describe, expect, it } from 'vitest'
import {
  normalizeReportedHost,
  projectAbuseReport,
  summarizeAbuseReports,
  type AbuseReportRow,
  type AbuseReportView,
} from '../shared/abuseReports'

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
    expect(view.reporterEmail).toBe('')
    expect(view.note).toBe('')
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
