import { describe, expect, it } from 'vitest'
import { buildEventIcs, escapeIcsText, toIcsDate } from '../server/utils/ics'

const row = {
  $id: 'evt1',
  $updatedAt: '2026-07-07T10:00:00.000+00:00',
  title: 'Sommerfest; mit Grill, Musik',
  description: 'Zeile 1\nZeile 2',
  startAt: '2026-08-01T18:00:00.000+00:00',
  endAt: '2026-08-01T21:30:00.000+00:00',
  location: 'Clubraum',
  url: 'https://example.com/fest',
  status: 'published' as const,
}

describe('toIcsDate', () => {
  it('formatiert ISO nach UTC-Basic', () => {
    expect(toIcsDate('2026-08-01T18:00:00.000Z')).toBe('20260801T180000Z')
  })

  it('normalisiert Offsets nach UTC', () => {
    expect(toIcsDate('2026-08-01T20:00:00.000+02:00')).toBe('20260801T180000Z')
  })
})

describe('escapeIcsText', () => {
  it('escapet Semikolon, Komma, Backslash und Zeilenumbrüche', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne')
  })
})

describe('buildEventIcs', () => {
  const ics = buildEventIcs(row)

  it('enthält VEVENT mit korrektem DTSTART/DTEND', () => {
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20260801T180000Z')
    expect(ics).toContain('DTEND:20260801T213000Z')
    expect(ics).toContain('UID:evt1@maui-events')
  })

  it('escapet Textfelder', () => {
    expect(ics).toContain('SUMMARY:Sommerfest\\; mit Grill\\, Musik')
    expect(ics).toContain('DESCRIPTION:Zeile 1\\nZeile 2')
  })

  it('nutzt CRLF-Zeilenenden', () => {
    expect(ics.includes('\r\n')).toBe(true)
    expect(ics.split('\r\n').some(line => line.includes('\n'))).toBe(false)
  })

  it('lässt DTEND weg, wenn endAt fehlt, und markiert Absagen', () => {
    const cancelled = buildEventIcs({ ...row, endAt: null, status: 'cancelled' })
    expect(cancelled).not.toContain('DTEND')
    expect(cancelled).toContain('STATUS:CANCELLED')
  })
})
