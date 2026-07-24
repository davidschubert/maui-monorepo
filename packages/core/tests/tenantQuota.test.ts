import { describe, expect, it } from 'vitest'
import { evaluateQuota, limitsForPlan } from '../server/utils/tenantQuota'

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

describe('limitsForPlan (Plan-Staffelung)', () => {
  const plans = {
    free: { comments: { perDay: 200, total: 5_000 } },
    pro: { comments: { perDay: 1000, total: 50_000 } },
    business: { comments: { perDay: 5000, total: 250_000 } },
  }
  it('wählt die Limits des Tenant-Plans', () => {
    expect(limitsForPlan(plans, 'pro', 'comments')).toEqual({ perDay: 1000, total: 50_000 })
    expect(limitsForPlan(plans, 'business', 'comments')).toEqual({ perDay: 5000, total: 250_000 })
  })
  it('unbekannter/fehlender Plan → free', () => {
    expect(limitsForPlan(plans, undefined, 'comments')).toEqual(plans.free.comments)
    expect(limitsForPlan(plans, 'enterprise', 'comments')).toEqual(plans.free.comments)
  })
  it('unbekannter kind → undefined (kein Limit)', () => {
    expect(limitsForPlan(plans, 'pro', 'posts')).toBeUndefined()
  })
  it('ohne plans-Katalog → undefined', () => {
    expect(limitsForPlan(undefined, 'pro', 'comments')).toBeUndefined()
  })
})
