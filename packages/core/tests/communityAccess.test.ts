import { describe, expect, it } from 'vitest'
import { decideCommunityAccess } from '../shared/communityAccess'

const OWNER = { role: 'owner' as const, labels: [] as string[] }

describe('Site-Zugriff: der normale Weg ist die Rolle', () => {
  it('lässt den Owner seine Seiten pflegen — ohne jedes globale Label', () => {
    const decision = decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, ...OWNER })
    expect(decision).toEqual({ allowed: true, via: 'role', role: 'owner' })
  })

  it('lässt den Moderator moderieren, aber nicht schreiben', () => {
    expect(decideCommunityAccess({ capability: 'comments.moderate', tenantScoped: true, role: 'moderator', labels: [] }).allowed).toBe(true)
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: 'moderator', labels: [] }))
      .toEqual({ allowed: false, reason: 'insufficient-role' })
  })

  it('lässt den Editor schreiben, aber nicht moderieren', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: 'editor', labels: [] }).allowed).toBe(true)
    expect(decideCommunityAccess({ capability: 'comments.moderate', tenantScoped: true, role: 'editor', labels: [] }).allowed).toBe(false)
  })

  it('lässt den Viewer nichts verwalten', () => {
    for (const capability of ['pages.manage', 'comments.moderate', 'branding.manage'] as const) {
      expect(decideCommunityAccess({ capability, tenantScoped: true, role: 'viewer', labels: [] }).allowed, capability).toBe(false)
    }
  })
})

describe('Fremde bleiben draußen', () => {
  it('weist ab, wer in DIESER Community keine Rolle hat', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: null, labels: [] }))
      .toEqual({ allowed: false, reason: 'no-role' })
  })

  it('lässt eine Owner-Rolle NICHT auf eine andere Community durchschlagen', () => {
    // Der Aufrufer löst die Rolle je Site auf; hier ist die Zusicherung, dass
    // „kein Rollen-Ergebnis" wirklich Nein heißt — auch für einen Menschen, der
    // woanders Owner ist.
    expect(decideCommunityAccess({ capability: 'community.delete', tenantScoped: true, role: null, labels: [] }).allowed).toBe(false)
  })
})

describe('Operator-Break-Glass', () => {
  it('lässt den Betreiber durch — als operator, nicht als Rolle', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: null, labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'operator' })
  })

  it('meldet Rolle statt Break-Glass, wenn die Rolle schon reicht', () => {
    // Wichtig fürs Log: ein Betreiber, der zufällig auch Mitglied ist, soll
    // nicht bei jedem Klick einen Break-Glass-Eintrag erzeugen.
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: 'owner', labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'role', role: 'owner' })
  })

  it('hilft einem Moderator-Label nicht über eine Inhalts-Capability', () => {
    // Das globale moderator-Label trägt comments.moderate, aber nicht pages.manage.
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: true, role: null, labels: ['moderator'] }).allowed).toBe(false)
    expect(decideCommunityAccess({ capability: 'comments.moderate', tenantScoped: true, role: null, labels: ['moderator'] }))
      .toEqual({ allowed: true, via: 'operator' })
  })
})

describe('Single-Tenant-Apps bleiben unverändert', () => {
  it('entscheidet ohne Mandanten weiter über die globalen Labels', () => {
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: false, role: null, labels: ['admin'] }))
      .toEqual({ allowed: true, via: 'single-tenant' })
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: false, role: null, labels: [] }))
      .toEqual({ allowed: false, reason: 'forbidden' })
  })

  it('ignoriert eine Site-Rolle ohne Mandanten-Kontext', () => {
    // Ohne Mandanten gibt es keine Site — eine mitgegebene Rolle wäre sinnlos
    // und darf nichts öffnen.
    expect(decideCommunityAccess({ capability: 'pages.manage', tenantScoped: false, role: 'owner', labels: [] }).allowed).toBe(false)
  })
})
