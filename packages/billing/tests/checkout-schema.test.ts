import { describe, expect, it } from 'vitest'
import { createCheckoutSchema } from '../schemas/billing'
import { ENTITLED_STATUSES } from '../shared/types/billing'

describe('createCheckoutSchema (B5 Tampering)', () => {
  const schema = createCheckoutSchema(['pro'])

  it('akzeptiert konfigurierte Pläne, Default-Intervall monatlich', () => {
    const parsed = schema.parse({ planId: 'pro' })
    expect(parsed.interval).toBe('monthly')
    expect(schema.safeParse({ planId: 'pro', interval: 'yearly' }).success).toBe(true)
  })

  it('lehnt fremde planIds und Preis-Injektion ab', () => {
    expect(schema.safeParse({ planId: 'enterprise' }).success).toBe(false)
    expect(schema.safeParse({ planId: 'price_123' }).success).toBe(false)
    expect(schema.safeParse({ planId: 'free' }).success).toBe(false) // free ist nicht checkout-fähig
  })

  it('lehnt unbekannte Intervalle ab', () => {
    expect(schema.safeParse({ planId: 'pro', interval: 'weekly' }).success).toBe(false)
  })
})

describe('Entitlement-Statusraum (§6)', () => {
  it('past_due behält Zugriff, canceled/unpaid nicht', () => {
    expect(ENTITLED_STATUSES).toContain('active')
    expect(ENTITLED_STATUSES).toContain('trialing')
    expect(ENTITLED_STATUSES).toContain('past_due')
    expect(ENTITLED_STATUSES).not.toContain('canceled')
    expect(ENTITLED_STATUSES).not.toContain('unpaid')
  })
})
