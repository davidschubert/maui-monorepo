import { describe, it, expect } from 'vitest'
import {
  TENANT_ROLES,
  TENANT_ROLE_CAPABILITIES,
  isTenantRole,
  tenantRoleHasCapability,
  tenantCapabilitiesFor,
} from '../shared/tenantAuthz'
import { ALL_CAPABILITIES } from '../shared/authz'
import type { Capability } from '../shared/types/authz'

describe('isTenantRole', () => {
  it('erkennt die 5 Site-Rollen', () => {
    for (const r of ['owner', 'admin', 'moderator', 'editor', 'viewer']) {
      expect(isTenantRole(r)).toBe(true)
    }
  })
  it('weist Fremdes ab (auch case-sensitive)', () => {
    expect(isTenantRole('Owner')).toBe(false)
    expect(isTenantRole('operator')).toBe(false)
    expect(isTenantRole('')).toBe(false)
  })
})

describe('Katalog-Konsistenz', () => {
  it('jede Site-Cap existiert im globalen Capability-Katalog', () => {
    const known = new Set<string>(ALL_CAPABILITIES)
    for (const role of TENANT_ROLES) {
      for (const cap of TENANT_ROLE_CAPABILITIES[role]) {
        expect(known.has(cap)).toBe(true)
      }
    }
  })
  it('keine Rolle hat Duplikate', () => {
    for (const role of TENANT_ROLES) {
      const caps = TENANT_ROLE_CAPABILITIES[role]
      expect(caps.length).toBe(new Set(caps).size)
    }
  })
})

describe('Rollen-Gitter (Subset-Beziehungen)', () => {
  const set = (r: (typeof TENANT_ROLES)[number]) => new Set(TENANT_ROLE_CAPABILITIES[r])
  const subset = (a: Set<Capability>, b: Set<Capability>) => [...a].every(c => b.has(c))

  it('viewer ⊂ editor, viewer ⊂ moderator', () => {
    expect(subset(set('viewer'), set('editor'))).toBe(true)
    expect(subset(set('viewer'), set('moderator'))).toBe(true)
  })
  it('editor ⊂ admin, moderator ⊂ admin', () => {
    expect(subset(set('editor'), set('admin'))).toBe(true)
    expect(subset(set('moderator'), set('admin'))).toBe(true)
  })
  it('admin ⊂ owner', () => {
    expect(subset(set('admin'), set('owner'))).toBe(true)
  })
  it('editor und moderator sind Geschwister (weder ⊇ noch ⊆)', () => {
    expect(subset(set('editor'), set('moderator'))).toBe(false)
    expect(subset(set('moderator'), set('editor'))).toBe(false)
  })
})

describe('Rollen-Trennung (die harten Grenzen)', () => {
  it('viewer verwaltet nichts — nur dashboard.access', () => {
    expect([...TENANT_ROLE_CAPABILITIES.viewer]).toEqual(['dashboard.access'])
  })

  it('editor verfasst, moderiert aber NICHT', () => {
    expect(tenantRoleHasCapability('editor', 'posts.write')).toBe(true)
    expect(tenantRoleHasCapability('editor', 'pages.manage')).toBe(true)
    const forbidden: Capability[] = [
      'comments.moderate', 'reports.moderate', 'posts.moderate',
      'branding.manage', 'team.manage', 'billing.manage', 'system.manage',
      'site.transfer', 'site.delete',
    ]
    for (const cap of forbidden) expect(tenantRoleHasCapability('editor', cap)).toBe(false)
  })

  it('moderator moderiert, verfasst/branded aber NICHT', () => {
    expect(tenantRoleHasCapability('moderator', 'comments.moderate')).toBe(true)
    expect(tenantRoleHasCapability('moderator', 'reports.moderate')).toBe(true)
    expect(tenantRoleHasCapability('moderator', 'posts.moderate')).toBe(true)
    const forbidden: Capability[] = [
      'posts.write', 'pages.manage', 'branding.manage', 'team.manage',
      'billing.manage', 'site.delete',
    ]
    for (const cap of forbidden) expect(tenantRoleHasCapability('moderator', cap)).toBe(false)
  })

  it('admin verwaltet Branding + Team, aber KEIN Billing/System und keine Owner-Aktion', () => {
    expect(tenantRoleHasCapability('admin', 'branding.manage')).toBe(true)
    expect(tenantRoleHasCapability('admin', 'team.manage')).toBe(true)
    expect(tenantRoleHasCapability('admin', 'courses.manage')).toBe(true)
    const forbidden: Capability[] = [
      'billing.manage', 'system.manage', 'sites.manage', 'users.manage',
      'site.transfer', 'site.delete',
    ]
    for (const cap of forbidden) expect(tenantRoleHasCapability('admin', cap)).toBe(false)
  })

  it('owner darf übergeben + löschen (als einzige Rolle)', () => {
    expect(tenantRoleHasCapability('owner', 'site.transfer')).toBe(true)
    expect(tenantRoleHasCapability('owner', 'site.delete')).toBe(true)
    for (const role of ['admin', 'moderator', 'editor', 'viewer'] as const) {
      expect(tenantRoleHasCapability(role, 'site.transfer')).toBe(false)
      expect(tenantRoleHasCapability(role, 'site.delete')).toBe(false)
    }
  })

  it('KEINE Site-Rolle hat Instanz-weite Operator-Rechte', () => {
    const operatorOnly: Capability[] = ['billing.manage', 'system.manage', 'sites.manage', 'users.manage']
    for (const role of TENANT_ROLES) {
      for (const cap of operatorOnly) {
        expect(tenantRoleHasCapability(role, cap)).toBe(false)
      }
    }
  })
})

describe('tenantCapabilitiesFor', () => {
  it('null/unbekannt → leeres Set', () => {
    expect(tenantCapabilitiesFor(null).size).toBe(0)
    expect(tenantCapabilitiesFor(undefined).size).toBe(0)
    // @ts-expect-error absichtlicher Fremdwert
    expect(tenantCapabilitiesFor('garbage').size).toBe(0)
  })
  it('owner → volles Set der Owner-Caps', () => {
    expect(tenantCapabilitiesFor('owner')).toEqual(new Set(TENANT_ROLE_CAPABILITIES.owner))
  })
})
