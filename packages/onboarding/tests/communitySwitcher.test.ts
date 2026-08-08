import { describe, expect, it } from 'vitest'
import type { MyCommunityView } from '../../control/shared/myCommunities'
import { SWITCHER_TEAM_ROLES, isSwitcherTeamRole, projectCommunitySwitcher } from '../shared/communitySwitcher'

/**
 * Die pure Hälfte des Community-Switchers (F50, 2026-08-07).
 *
 * Vier Zusagen, jede einzeln nagelbar: nur Team-Rollen, Viewer raus, die
 * aktuelle Community zuerst, und der Rest in der Reihenfolge, in der das
 * Control Plane sie geliefert hat.
 */

const view = (over: Partial<MyCommunityView> & Pick<MyCommunityView, 'communityId' | 'role'>): MyCommunityView => ({
  name: over.name ?? `Community ${over.communityId}`,
  host: over.host ?? `${over.communityId}.pukalani.app`,
  plan: 'personal',
  trialEndsAt: null,
  suspension: '',
  readOnly: false,
  ...over,
})

describe('isSwitcherTeamRole', () => {
  it('kennt genau die vier Team-Rollen', () => {
    expect([...SWITCHER_TEAM_ROLES]).toEqual(['owner', 'admin', 'moderator', 'editor'])
    expect(isSwitcherTeamRole('owner')).toBe(true)
    expect(isSwitcherTeamRole('admin')).toBe(true)
    expect(isSwitcherTeamRole('moderator')).toBe(true)
    expect(isSwitcherTeamRole('editor')).toBe(true)
  })

  it('der Viewer gehört NICHT dazu (Davids Auswahl-Text nannte die Team-Rollen)', () => {
    expect(isSwitcherTeamRole('viewer')).toBe(false)
  })
})

describe('projectCommunitySwitcher', () => {
  it('projiziert auf die vier Menü-Felder — nichts aus dem Vertrag reist mit', () => {
    const entries = projectCommunitySwitcher(
      [view({ communityId: 'c1', name: 'Morgenlicht', host: 'morgenlicht.pukalani.app', role: 'owner', plan: 'pro', readOnly: true, suspension: 'billing' })],
      '',
    )
    expect(entries).toEqual([
      { communityId: 'c1', name: 'Morgenlicht', host: 'morgenlicht.pukalani.app', role: 'owner', current: false },
    ])
  })

  it('lässt Viewer-Mitgliedschaften weg — ein Dashboard ohne Punkte ist eine Sackgasse', () => {
    const entries = projectCommunitySwitcher(
      [view({ communityId: 'c1', role: 'owner' }), view({ communityId: 'c2', role: 'viewer' })],
      '',
    )
    expect(entries.map(e => e.communityId)).toEqual(['c1'])
  })

  it('lässt Einträge ohne Adresse weg', () => {
    const entries = projectCommunitySwitcher(
      [view({ communityId: 'c1', role: 'admin', host: '' }), view({ communityId: 'c2', role: 'admin' })],
      '',
    )
    expect(entries.map(e => e.communityId)).toEqual(['c2'])
  })

  it('stellt die aktuelle Community nach vorn und markiert sie', () => {
    const entries = projectCommunitySwitcher(
      [
        view({ communityId: 'c1', role: 'owner' }),
        view({ communityId: 'c2', role: 'admin' }),
        view({ communityId: 'c3', role: 'editor' }),
      ],
      'c3',
    )
    expect(entries.map(e => e.communityId)).toEqual(['c3', 'c1', 'c2'])
    expect(entries.map(e => e.current)).toEqual([true, false, false])
  })

  it('behält sonst die Reihenfolge des Control Plane (owner zuerst, dann alphabetisch)', () => {
    const entries = projectCommunitySwitcher(
      [
        view({ communityId: 'c1', role: 'owner' }),
        view({ communityId: 'c2', role: 'admin' }),
        view({ communityId: 'c3', role: 'moderator' }),
      ],
      '',
    )
    expect(entries.map(e => e.communityId)).toEqual(['c1', 'c2', 'c3'])
    expect(entries.every(e => !e.current)).toBe(true)
  })

  it('markiert nichts, wenn der Mandant keine Id mitbringt', () => {
    // Silo-Bestand/Fixtures bauen den Kontext ohne `communityId`. Ein leerer
    // Vergleichswert darf NICHT auf einen leeren Eintrag treffen und dort ein
    // Häkchen setzen.
    const entries = projectCommunitySwitcher([view({ communityId: '', role: 'owner' })], '')
    expect(entries.every(e => !e.current)).toBe(true)
  })
})
