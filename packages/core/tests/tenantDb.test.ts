import { describe, expect, it } from 'vitest'
import { stripTenantKey } from '../server/utils/tenantDb'

describe('stripTenantKey — der Mandant kommt NIE vom Aufrufer', () => {
  it('entfernt tenantId aus den Daten', () => {
    expect(stripTenantKey({ title: 'Hallo', tenantId: 'fremd' })).toEqual({ title: 'Hallo' })
  })

  it('lässt Daten ohne tenantId unberührt (dieselbe Referenz, kein Kopieren)', () => {
    const data = { title: 'Hallo' }
    expect(stripTenantKey(data)).toBe(data)
  })

  it('entfernt tenantId auch, wenn sie leer oder null ist', () => {
    // Sonst könnte ein durchgereichter Body den Stempel der Tür überschreiben
    // und die Zeile mandantenlos machen — im Pool wäre sie danach für niemanden
    // mehr auffindbar (fail-closed) statt für alle.
    expect(stripTenantKey({ a: 1, tenantId: '' })).toEqual({ a: 1 })
    expect(stripTenantKey({ a: 1, tenantId: null })).toEqual({ a: 1 })
  })

  it('rührt andere Felder nicht an', () => {
    const out = stripTenantKey({ tenantId: 'x', nested: { tenantId: 'bleibt' }, n: 0, f: false })
    expect(out).toEqual({ nested: { tenantId: 'bleibt' }, n: 0, f: false })
  })
})
