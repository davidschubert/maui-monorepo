import { describe, expect, it } from 'vitest'
import { COMMUNITY_ROLES } from '../shared/communityAuthz'
import {
  COMMUNITY_JOIN_ROLE,
  joinOutcomeGrantsAccess,
  joinOutcomeRevokesAccess,
  type CommunityJoinOutcome,
} from '../shared/communityJoin'

/**
 * A5 — der pure Teil des Beitritts-Vertrags. Klein, aber genau die zwei Sätze,
 * an denen das Site-Label hängt: WANN es vergeben und WANN es eingezogen wird.
 */

const ALL: CommunityJoinOutcome[] = ['joined', 'member', 'closed', 'removed', 'unavailable']

describe('COMMUNITY_JOIN_ROLE', () => {
  it('ist eine echte Rolle aus dem core-Katalog (kein Fantasiewert)', () => {
    expect(COMMUNITY_ROLES).toContain(COMMUNITY_JOIN_ROLE)
  })

  it('ist die schwächste Stufe — Beitritt verleiht keine Verwaltungsrechte', () => {
    expect(COMMUNITY_JOIN_ROLE).toBe('viewer')
  })
})

describe('joinOutcomeGrantsAccess', () => {
  it('nur „beigetreten" und „ist schon Mitglied" vergeben das Label', () => {
    expect(ALL.filter(joinOutcomeGrantsAccess)).toEqual(['joined', 'member'])
  })
})

describe('joinOutcomeRevokesAccess', () => {
  it('nur „entzogen" und „geschlossen" ziehen ein Label ein', () => {
    expect(ALL.filter(joinOutcomeRevokesAccess)).toEqual(['closed', 'removed'])
  })

  it('eine gestörte Naht („unavailable") nimmt NIEMANDEM den Zugang', () => {
    // Der wichtigste Fall dieser Datei: wäre 'unavailable' hier true, würde ein
    // Ausfall des Control Plane echte Mitglieder aus ihrer Community werfen.
    expect(joinOutcomeRevokesAccess('unavailable')).toBe(false)
    expect(joinOutcomeGrantsAccess('unavailable')).toBe(false)
  })
})
