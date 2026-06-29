import { describe, it, expect } from 'vitest'
import {
  ROLES,
  ALL_CAPABILITIES,
  ROLE_CAPABILITIES,
  isRole,
  capabilitiesFor,
  hasCapability,
} from '../shared/authz'
import type { Capability } from '../shared/types/authz'

describe('isRole', () => {
  it('erkennt bekannte Rollen', () => {
    expect(isRole('admin')).toBe(true)
    expect(isRole('moderator')).toBe(true)
  })

  it('weist unbekannte Labels ab', () => {
    expect(isRole('owner')).toBe(false)
    expect(isRole('editor')).toBe(false)
    expect(isRole('')).toBe(false)
    expect(isRole('Admin')).toBe(false) // case-sensitive
  })
})

describe('Matrix-Konsistenz', () => {
  it('admin hat exakt alle Capabilities', () => {
    expect([...ROLE_CAPABILITIES.admin].sort()).toEqual([...ALL_CAPABILITIES].sort())
  })

  it('jede Capability einer Rolle ist im ALL_CAPABILITIES-Katalog', () => {
    const known = new Set<string>(ALL_CAPABILITIES)
    for (const role of ROLES) {
      for (const cap of ROLE_CAPABILITIES[role]) {
        expect(known.has(cap)).toBe(true)
      }
    }
  })
})

describe('capabilitiesFor', () => {
  it('leere/fehlende Labels → leeres Set', () => {
    expect(capabilitiesFor(null).size).toBe(0)
    expect(capabilitiesFor(undefined).size).toBe(0)
    expect(capabilitiesFor([]).size).toBe(0)
  })

  it('admin → alle Capabilities', () => {
    const caps = capabilitiesFor(['admin'])
    expect(caps.size).toBe(ALL_CAPABILITIES.length)
    for (const cap of ALL_CAPABILITIES) expect(caps.has(cap)).toBe(true)
  })

  it('moderator → genau dashboard.access, comments.moderate, reports.moderate', () => {
    expect([...capabilitiesFor(['moderator'])].sort()).toEqual(
      ['comments.moderate', 'dashboard.access', 'reports.moderate'],
    )
  })

  it('vereinigt mehrere Rollen', () => {
    expect(capabilitiesFor(['admin', 'moderator']).size).toBe(ALL_CAPABILITIES.length)
  })

  it('ignoriert unbekannte Labels (keine Eskalation durch Fremd-Label)', () => {
    expect(capabilitiesFor(['garbage']).size).toBe(0)
    // moderator + Müll bleibt moderator
    expect([...capabilitiesFor(['moderator', 'garbage'])].sort()).toEqual(
      ['comments.moderate', 'dashboard.access', 'reports.moderate'],
    )
  })
})

describe('hasCapability', () => {
  it('admin besitzt jede Capability', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(hasCapability(['admin'], cap)).toBe(true)
    }
  })

  it('ohne Labels keine Capability', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(hasCapability(null, cap)).toBe(false)
      expect(hasCapability([], cap)).toBe(false)
    }
  })

  it('moderator: hat Moderations-Rechte, aber NICHT die privilegierten', () => {
    expect(hasCapability(['moderator'], 'dashboard.access')).toBe(true)
    expect(hasCapability(['moderator'], 'comments.moderate')).toBe(true)
    expect(hasCapability(['moderator'], 'reports.moderate')).toBe(true)

    const forbidden: Capability[] = ['users.manage', 'system.manage', 'storage.manage', 'audit.read', 'changelog.manage']
    for (const cap of forbidden) {
      expect(hasCapability(['moderator'], cap)).toBe(false)
    }
  })

  it('unbekanntes Label gewährt nichts', () => {
    expect(hasCapability(['garbage'], 'dashboard.access')).toBe(false)
  })
})
