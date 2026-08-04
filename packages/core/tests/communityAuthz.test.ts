import { describe, it, expect } from 'vitest'
import {
  COMMUNITY_ROLES,
  COMMUNITY_ROLE_CAPABILITIES,
  isCommunityRole,
  communityRoleHasCapability,
  communityCapabilitiesFor,
} from '../shared/communityAuthz'
import { ALL_CAPABILITIES, capabilitiesFor } from '../shared/authz'
import type { Capability } from '../shared/types/authz'

describe('isCommunityRole', () => {
  it('erkennt die 5 Site-Rollen', () => {
    for (const r of ['owner', 'admin', 'moderator', 'editor', 'viewer']) {
      expect(isCommunityRole(r)).toBe(true)
    }
  })
  it('weist Fremdes ab (auch case-sensitive)', () => {
    expect(isCommunityRole('Owner')).toBe(false)
    expect(isCommunityRole('operator')).toBe(false)
    expect(isCommunityRole('')).toBe(false)
  })
})

describe('Katalog-Konsistenz', () => {
  it('jede Site-Cap existiert im globalen Capability-Katalog', () => {
    const known = new Set<string>(ALL_CAPABILITIES)
    for (const role of COMMUNITY_ROLES) {
      for (const cap of COMMUNITY_ROLE_CAPABILITIES[role]) {
        expect(known.has(cap)).toBe(true)
      }
    }
  })
  it('keine Rolle hat Duplikate', () => {
    for (const role of COMMUNITY_ROLES) {
      const caps = COMMUNITY_ROLE_CAPABILITIES[role]
      expect(caps.length).toBe(new Set(caps).size)
    }
  })
})

describe('Rollen-Gitter (Subset-Beziehungen)', () => {
  const set = (r: (typeof COMMUNITY_ROLES)[number]) => new Set(COMMUNITY_ROLE_CAPABILITIES[r])
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
    expect([...COMMUNITY_ROLE_CAPABILITIES.viewer]).toEqual(['dashboard.access'])
  })

  it('editor verfasst, moderiert aber NICHT', () => {
    expect(communityRoleHasCapability('editor', 'posts.write')).toBe(true)
    expect(communityRoleHasCapability('editor', 'pages.manage')).toBe(true)
    const forbidden: Capability[] = [
      'comments.moderate', 'reports.moderate', 'posts.moderate',
      // F1: die Kategorien-STRUKTUR gehört dem Admin — ein Editor verfasst
      // Beiträge, er bestimmt nicht den Rahmen, in dem alle schreiben.
      'posts.manage',
      'branding.manage', 'team.manage', 'billing.manage', 'system.manage',
      'community.transfer', 'community.delete',
    ]
    for (const cap of forbidden) expect(communityRoleHasCapability('editor', cap)).toBe(false)
  })

  it('moderator moderiert, verfasst/branded aber NICHT', () => {
    expect(communityRoleHasCapability('moderator', 'comments.moderate')).toBe(true)
    expect(communityRoleHasCapability('moderator', 'reports.moderate')).toBe(true)
    expect(communityRoleHasCapability('moderator', 'posts.moderate')).toBe(true)
    const forbidden: Capability[] = [
      // F1: auch der Moderator baut die Struktur nicht um — er urteilt über
      // Inhalte, der Rahmen ist eine Entscheidung des Admins/Owners.
      'posts.write', 'posts.manage', 'pages.manage', 'branding.manage', 'team.manage',
      'billing.manage', 'community.delete',
    ]
    for (const cap of forbidden) expect(communityRoleHasCapability('moderator', cap)).toBe(false)
  })

  it('admin verwaltet Branding + Team, aber KEIN Billing/System und keine Owner-Aktion', () => {
    expect(communityRoleHasCapability('admin', 'branding.manage')).toBe(true)
    expect(communityRoleHasCapability('admin', 'team.manage')).toBe(true)
    expect(communityRoleHasCapability('admin', 'courses.manage')).toBe(true)
    expect(communityRoleHasCapability('admin', 'posts.manage')).toBe(true)
    const forbidden: Capability[] = [
      'billing.manage', 'system.manage', 'sites.manage', 'users.manage',
      'community.transfer', 'community.delete',
    ]
    for (const cap of forbidden) expect(communityRoleHasCapability('admin', cap)).toBe(false)
  })

  it('owner darf übergeben + löschen (als einzige Rolle)', () => {
    expect(communityRoleHasCapability('owner', 'community.transfer')).toBe(true)
    expect(communityRoleHasCapability('owner', 'community.delete')).toBe(true)
    for (const role of ['admin', 'moderator', 'editor', 'viewer'] as const) {
      expect(communityRoleHasCapability(role, 'community.transfer')).toBe(false)
      expect(communityRoleHasCapability(role, 'community.delete')).toBe(false)
    }
  })

  /**
   * F37 (2026-08-02): das Einbetter-Register des Widgets. Wer eine fremde
   * Domain freigibt, öffnet die Community nach außen (frame-ancestors +
   * partitioniertes Session-Cookie auf der Gastgeber-Seite) — dieselbe Klasse
   * wie das Abo, deshalb dieselbe Grenze. Ein Admin verwaltet, was INNEN
   * passiert.
   */
  it('nur der owner verwaltet die Einbetter des Widgets (community.embed)', () => {
    expect(communityRoleHasCapability('owner', 'community.embed')).toBe(true)
    for (const role of ['admin', 'moderator', 'editor', 'viewer'] as const) {
      expect(communityRoleHasCapability(role, 'community.embed')).toBe(false)
    }
  })

  /**
   * …und der SILO-Weg bleibt offen: apps/comments registriert seine Einbetter
   * weiter über das globale Betreiber-Label. Ohne diese Zeile im Wildcard
   * (shared/authz.ts) hätte die Umstellung von `system.manage` auf
   * `community.embed` die bestehende Silo-Seite still ausgesperrt —
   * `decideCommunityAccess` fragt ohne Mandanten ausschließlich das Label.
   */
  it('der Operator-Admin trägt community.embed weiterhin (Silo-Weg)', () => {
    expect(capabilitiesFor(['admin']).has('community.embed')).toBe(true)
    expect(capabilitiesFor(['moderator']).has('community.embed')).toBe(false)
  })

  it('JEDE Site-Rolle trägt dashboard.access (N1 — Vertrag der admin-Middleware: Site-Mitglieder erreichen das Kunden-Dashboard; was sie DRIN sehen, filtern Nav + requiredCapability)', () => {
    for (const role of COMMUNITY_ROLES) {
      expect(communityRoleHasCapability(role, 'dashboard.access')).toBe(true)
    }
  })

  it('KEINE Site-Rolle hat Instanz-weite Operator-Rechte', () => {
    // Zugleich der Nav-Vertrag (N1): Module/Links mit diesen Caps bleiben für
    // reine Site-Mitglieder unsichtbar (People, Admin/Audit, Storage, System/
    // Themes/Config, Sites, Billing, Feedback, Tickets, Changelog).
    const operatorOnly: Capability[] = [
      'billing.manage', 'system.manage', 'sites.manage', 'users.manage',
      'audit.read', 'storage.manage', 'feedback.manage', 'tickets.manage',
      'changelog.manage',
    ]
    for (const role of COMMUNITY_ROLES) {
      for (const cap of operatorOnly) {
        expect(communityRoleHasCapability(role, cap)).toBe(false)
      }
    }
  })
})

describe('communityCapabilitiesFor', () => {
  it('null/unbekannt → leeres Set', () => {
    expect(communityCapabilitiesFor(null).size).toBe(0)
    expect(communityCapabilitiesFor(undefined).size).toBe(0)
    // @ts-expect-error absichtlicher Fremdwert
    expect(communityCapabilitiesFor('garbage').size).toBe(0)
  })
  it('owner → volles Set der Owner-Caps', () => {
    expect(communityCapabilitiesFor('owner')).toEqual(new Set(COMMUNITY_ROLE_CAPABILITIES.owner))
  })
})
