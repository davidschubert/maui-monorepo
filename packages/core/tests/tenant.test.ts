import { describe, expect, it } from 'vitest'
import { scopeQueriesFor, scopeRowFor } from '../server/utils/tenant'
import type { TenantContext } from '../shared/types/tenant'

const pool: TenantContext = { mode: 'pool', projectId: 'shared-1', tenantId: 'acme' }
const silo: TenantContext = { mode: 'silo', projectId: 'silo-bigcorp' }

describe('scopeQueriesFor', () => {
  it('pool: hängt einen tenantId-Filter an', () => {
    const q = scopeQueriesFor(pool, [])
    expect(q).toHaveLength(1)
    expect(q[0]).toContain('tenantId')
    expect(q[0]).toContain('acme')
  })
  it('pool: bestehende Queries bleiben erhalten', () => {
    expect(scopeQueriesFor(pool, ['bereits-da'])).toHaveLength(2)
  })
  it('silo: Queries unverändert (Isolation am Projekt)', () => {
    expect(scopeQueriesFor(silo, [])).toEqual([])
  })
  it('null (heutiger Single-Tenant, ruhend): unverändert', () => {
    expect(scopeQueriesFor(null, ['x'])).toEqual(['x'])
  })
})

describe('scopeRowFor', () => {
  it('pool: setzt tenantId auf der Zeile', () => {
    expect(scopeRowFor(pool, { text: 'hi' })).toEqual({ text: 'hi', tenantId: 'acme' })
  })
  it('silo: kein tenantId (Projekt-isoliert)', () => {
    expect(scopeRowFor(silo, { text: 'hi' }).tenantId).toBeUndefined()
  })
  it('null (ruhend): kein tenantId → heutiges Verhalten', () => {
    expect(scopeRowFor(null, { text: 'hi' }).tenantId).toBeUndefined()
  })
})
