import { describe, expect, it } from 'vitest'
import { registrationOpenFor, rowBelongsToTenant, scopeQueriesFor, scopeRowFor, tenantCacheScopeFor } from '../server/utils/tenant'
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

describe('tenantCacheScopeFor (Cross-Tenant-Cache-Regel)', () => {
  it('pool: Scope trägt die tenantId — zwei Pool-Kunden teilen keinen Key', () => {
    expect(tenantCacheScopeFor(pool)).toBe('pool:acme')
    expect(tenantCacheScopeFor({ mode: 'pool', projectId: 'shared-1', tenantId: 'other' }))
      .not.toBe(tenantCacheScopeFor(pool))
  })
  it('silo: Scope trägt das Projekt', () => {
    expect(tenantCacheScopeFor(silo)).toBe('silo:silo-bigcorp')
  })
  it('null (Single-Tenant): stabiler Key — Verhalten unverändert', () => {
    expect(tenantCacheScopeFor(null)).toBe('single')
  })
})

describe('rowBelongsToTenant — die Grenze beim Zugriff PER ID', () => {
  it('pool: nur die eigene Zeile', () => {
    expect(rowBelongsToTenant(pool, { tenantId: 'acme' })).toBe(true)
    expect(rowBelongsToTenant(pool, { tenantId: 'fremd' })).toBe(false)
  })

  it('pool: Zeile OHNE tenantId gilt als fremd (fail-closed)', () => {
    // Bestand vor der Migration. Lieber ein 404 auf eine eigene Altzeile als
    // ein Treffer auf eine fremde.
    expect(rowBelongsToTenant(pool, { tenantId: '' })).toBe(false)
    expect(rowBelongsToTenant(pool, {})).toBe(false)
    expect(rowBelongsToTenant(pool, { tenantId: null })).toBe(false)
  })

  it('silo und Single-Tenant: das Projekt IST die Grenze', () => {
    expect(rowBelongsToTenant(silo, { tenantId: '' })).toBe(true)
    expect(rowBelongsToTenant(silo, {})).toBe(true)
    expect(rowBelongsToTenant(null, {})).toBe(true)
  })

  it('nichts vorhanden ist nie "meins"', () => {
    expect(rowBelongsToTenant(pool, null)).toBe(false)
    expect(rowBelongsToTenant(null, undefined)).toBe(false)
  })
})

describe('registrationOpenFor (S1)', () => {
  it('kein Mandant (Silo-App, Kontroll-Host, Playground) → offen', () => {
    // Diese Deployments haben keine Community-Grenze; ihre Registrierung regelt
    // weiterhin app_config.registrationEnabled. Der Schalter darf sie nicht
    // anfassen — sonst hätte S1 Bestands-Apps zugemacht.
    expect(registrationOpenFor(null)).toBe(true)
  })
  it('Mandant ohne das Feld (Fixture/älterer Resolver) → offen', () => {
    expect(registrationOpenFor(pool)).toBe(true)
    expect(registrationOpenFor(silo)).toBe(true)
  })
  it('nur der exakte Wert false schließt — pool wie silo', () => {
    expect(registrationOpenFor({ ...pool, openRegistration: false })).toBe(false)
    expect(registrationOpenFor({ ...silo, openRegistration: false })).toBe(false)
    expect(registrationOpenFor({ ...pool, openRegistration: true })).toBe(true)
  })
})
