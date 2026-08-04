import { describe, it, expect } from 'vitest'
import {
  TOPIC_ORDERS,
  TOP_PERIODS,
  createdAfterIso,
  isTopPeriod,
  isTopicOrder,
  periodStartIso,
} from '../shared/discussionSort'

describe('Katalog', () => {
  it('kennt genau die gebauten Sortierungen — „hot" ist bewusst NICHT dabei', () => {
    expect([...TOPIC_ORDERS]).toEqual(['latest', 'top', 'categories'])
    expect(isTopicOrder('hot')).toBe(false)
  })

  it('kennt die sechs Zeiträume und weist Fremdes ab', () => {
    expect([...TOP_PERIODS]).toEqual(['all', 'year', 'quarter', 'month', 'week', 'today'])
    expect(isTopPeriod('decade')).toBe(false)
    expect(isTopPeriod(7)).toBe(false)
    expect(isTopicOrder(undefined)).toBe(false)
  })
})

describe('periodStartIso', () => {
  const now = new Date('2026-08-03T14:30:00.000Z')

  it('„all time" hat kein Fenster', () => {
    expect(periodStartIso('all', now)).toBeNull()
  })

  it('„today" beginnt an der UTC-Mitternacht DIESES Tages, nicht vor 24 Stunden', () => {
    expect(periodStartIso('today', now)).toBe('2026-08-03T00:00:00.000Z')
    // Gegenprobe: das rollierende 24-h-Fenster wäre der Vortag gewesen.
    expect(periodStartIso('today', now)).not.toBe('2026-08-02T14:30:00.000Z')
  })

  it('die übrigen Zeiträume sind rollierende Fenster ab jetzt', () => {
    expect(periodStartIso('week', now)).toBe('2026-07-27T14:30:00.000Z')
    expect(periodStartIso('month', now)).toBe('2026-07-04T14:30:00.000Z')
    expect(periodStartIso('quarter', now)).toBe('2026-05-05T14:30:00.000Z')
    expect(periodStartIso('year', now)).toBe('2025-08-03T14:30:00.000Z')
  })

  it('liegt für jeden Zeitraum außer „all" in der Vergangenheit', () => {
    for (const period of TOP_PERIODS) {
      const start = periodStartIso(period, now)
      if (period === 'all') {
        expect(start).toBeNull()
        continue
      }
      expect(Date.parse(start!)).toBeLessThanOrEqual(now.getTime())
    }
  })
})

describe('createdAfterIso', () => {
  const now = new Date('2026-08-03T14:30:00.000Z')

  it('nimmt ein Datum im Format YYYY-MM-DD (ab Tagesbeginn UTC)', () => {
    expect(createdAfterIso('2026-01-15', now)).toBe('2026-01-15T00:00:00.000Z')
  })

  it('nimmt eine Tagesangabe „Nd"', () => {
    expect(createdAfterIso('7d', now)).toBe('2026-07-27T14:30:00.000Z')
  })

  it('ignoriert Unsinn, statt die öffentliche Liste mit 400 abzuschießen', () => {
    for (const value of ['', '   ', 'gestern', '2026-13-45', '0d', '99999d', '15.01.2026', 42, null, undefined]) {
      expect(createdAfterIso(value, now)).toBeNull()
    }
  })

  it('weist ein syntaktisch gültiges, aber unmögliches Datum ab', () => {
    // Date.parse('2026-02-30T…') ist in Node NaN — die Gegenprobe hält das fest.
    expect(createdAfterIso('2026-02-30', now)).toBeNull()
  })
})
