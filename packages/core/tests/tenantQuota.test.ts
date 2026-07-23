import { describe, expect, it } from 'vitest'
import { evaluateQuota } from '../server/utils/tenantQuota'

describe('evaluateQuota (H3-4.3 Pool-Quota)', () => {
  it('unter beiden Limits: ok', () => {
    expect(evaluateQuota({ day: 5, total: 100 }, { perDay: 10, total: 1000 })).toBe('ok')
  })
  it('total gewinnt vor perDay (härtestes Limit zuerst gemeldet)', () => {
    expect(evaluateQuota({ day: 10, total: 1000 }, { perDay: 10, total: 1000 })).toBe('total')
  })
  it('Tageslimit erreicht (>= zählt: der N+1te Schreibzugriff wird geblockt)', () => {
    expect(evaluateQuota({ day: 10, total: 50 }, { perDay: 10, total: 1000 })).toBe('perDay')
    expect(evaluateQuota({ day: 9, total: 50 }, { perDay: 10, total: 1000 })).toBe('ok')
  })
  it('0/fehlend = unbegrenzt', () => {
    expect(evaluateQuota({ day: 99999, total: 99999 }, {})).toBe('ok')
    expect(evaluateQuota({ day: 99999, total: 99999 }, { perDay: 0, total: 0 })).toBe('ok')
  })
})
