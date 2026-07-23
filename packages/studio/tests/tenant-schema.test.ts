import { describe, expect, it } from 'vitest'
import { tenantCreateSchema, tenantStatusSchema } from '../schemas/tenant'

const valid = { host: 'kunde-a.pukalani.app', mode: 'pool' as const, projectId: 'pool-1' }

describe('tenantCreateSchema', () => {
  it('akzeptiert kanonische Hosts und lowercased', () => {
    const parsed = tenantCreateSchema.parse({ ...valid, host: 'Kunde-A.Pukalani.App' })
    expect(parsed.host).toBe('kunde-a.pukalani.app')
  })
  it('lehnt Ports, Protokolle, Pfade und nackte Labels ab', () => {
    for (const host of ['kunde:443', 'https://kunde.de', 'kunde.de/pfad', 'localhost', '-bad.de', 'x.']) {
      expect(tenantCreateSchema.safeParse({ ...valid, host }).success, host).toBe(false)
    }
  })
  it('mode nur pool|silo, tenantId optional', () => {
    expect(tenantCreateSchema.safeParse({ ...valid, mode: 'hybrid' }).success).toBe(false)
    expect(tenantCreateSchema.safeParse({ ...valid, tenantId: 't-abc' }).success).toBe(true)
  })
})

describe('tenantStatusSchema', () => {
  it('nur active|disabled', () => {
    expect(tenantStatusSchema.safeParse({ status: 'active' }).success).toBe(true)
    expect(tenantStatusSchema.safeParse({ status: 'deleted' }).success).toBe(false)
  })
})
