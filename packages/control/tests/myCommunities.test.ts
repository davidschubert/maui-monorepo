import { describe, expect, it } from 'vitest'
import { projectMyCommunities, type MyCommunityFacts } from '../shared/myCommunities'

/**
 * Die drei Entscheidungen der Kunden-Übersicht (F12), festgenagelt:
 * stillgelegte Communities fallen weg, die Testphase sieht nur wer zahlt,
 * eigene Communities stehen oben.
 */
function facts(overrides: Partial<MyCommunityFacts> = {}): MyCommunityFacts {
  return {
    communityId: 'c1',
    name: 'Morgenlicht',
    host: 'morgenlicht.pukalani.app',
    role: 'owner',
    communityStatus: 'active',
    plan: 'personal',
    trialEndsAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  }
}

describe('Kunden-Übersicht projizieren', () => {
  it('gibt Name, Adresse, Rolle und Plan heraus', () => {
    const [view] = projectMyCommunities([facts()])
    expect(view).toEqual({
      communityId: 'c1',
      name: 'Morgenlicht',
      host: 'morgenlicht.pukalani.app',
      role: 'owner',
      plan: 'personal',
      trialEndsAt: '2026-08-14T00:00:00.000Z',
    })
  })

  it('lässt stillgelegte Communities weg — ihr Host antwortet 404', () => {
    expect(projectMyCommunities([facts({ communityStatus: 'disabled' })])).toEqual([])
  })

  it('zeigt die Testphase NUR dem, der abrechnet (community.billing = owner)', () => {
    for (const role of ['admin', 'moderator', 'editor', 'viewer'] as const) {
      const [view] = projectMyCommunities([facts({ role })])
      expect(view?.trialEndsAt, role).toBeNull()
    }
    expect(projectMyCommunities([facts({ role: 'owner' })])[0]?.trialEndsAt).toBe('2026-08-14T00:00:00.000Z')
  })

  it('normalisiert Alt-Pläne und leere Spalten auf Basic', () => {
    expect(projectMyCommunities([facts({ plan: '' })])[0]?.plan).toBe('basic')
    expect(projectMyCommunities([facts({ plan: null })])[0]?.plan).toBe('basic')
    expect(projectMyCommunities([facts({ plan: 'business' })])[0]?.plan).toBe('pro')
  })

  it('sortiert eigene zuerst, danach alphabetisch', () => {
    const rows = projectMyCommunities([
      facts({ communityId: 'v2', name: 'Zebra', role: 'viewer' }),
      facts({ communityId: 'v1', name: 'Anker', role: 'viewer' }),
      facts({ communityId: 'a1', name: 'Verein', role: 'admin' }),
      facts({ communityId: 'o1', name: 'Morgenlicht', role: 'owner' }),
    ])
    expect(rows.map(row => row.communityId)).toEqual(['o1', 'a1', 'v1', 'v2'])
  })

  it('bleibt bei leerer Eingabe leer', () => {
    expect(projectMyCommunities([])).toEqual([])
  })
})
