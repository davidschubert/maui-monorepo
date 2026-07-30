import { describe, expect, it } from 'vitest'
import { TENANT_ROLES } from '../shared/tenantAuthz'
import {
  SITE_JOIN_ROLE,
  joinOutcomeGrantsAccess,
  joinOutcomeRevokesAccess,
  type SiteJoinOutcome,
} from '../shared/siteJoin'

/**
 * A5 — der pure Teil des Beitritts-Vertrags. Klein, aber genau die zwei Sätze,
 * an denen das Site-Label hängt: WANN es vergeben und WANN es eingezogen wird.
 */

const ALL: SiteJoinOutcome[] = ['joined', 'member', 'closed', 'removed', 'unavailable']

describe('SITE_JOIN_ROLE', () => {
  it('ist eine echte Rolle aus dem core-Katalog (kein Fantasiewert)', () => {
    expect(TENANT_ROLES).toContain(SITE_JOIN_ROLE)
  })

  it('ist die schwächste Stufe — Beitritt verleiht keine Verwaltungsrechte', () => {
    expect(SITE_JOIN_ROLE).toBe('viewer')
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
