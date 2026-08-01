import { describe, expect, it } from 'vitest'
import { resolveAdminNotices, type PukalaniAdminNoticeConfig } from '../shared/types/admin-notice'
import type { Capability } from '../shared/types/authz'

/**
 * Hinweis-Registry der Dashboard-Übersicht (M13). Dieselbe Bauart wie die
 * Chrome-Utilities: Objekt-Map, `false` schaltet ab, Capability filtert.
 */
const ALL = () => true
const NONE = () => false

describe('resolveAdminNotices', () => {
  it('gibt ohne Registrierungen nichts heraus', () => {
    expect(resolveAdminNotices(undefined, ALL)).toEqual([])
    expect(resolveAdminNotices({}, ALL)).toEqual([])
  })

  it('sortiert nach order und trägt die Id mit', () => {
    const notices: PukalaniAdminNoticeConfig = {
      spaet: { component: 'B', order: 90 },
      frueh: { component: 'A', order: 10 },
      ohne: { component: 'C' }, // Default 50
    }
    expect(resolveAdminNotices(notices, ALL)).toEqual([
      { id: 'frueh', component: 'A' },
      { id: 'ohne', component: 'C' },
      { id: 'spaet', component: 'B' },
    ])
  })

  it('lässt eine App einen Eintrag mit false abschalten', () => {
    const notices: PukalaniAdminNoticeConfig = { a: { component: 'A' }, b: false }
    expect(resolveAdminNotices(notices, ALL)).toEqual([{ id: 'a', component: 'A' }])
  })

  it('filtert nach Capability — ein Hinweis ohne Handlungsmöglichkeit ist Lärm', () => {
    const notices: PukalaniAdminNoticeConfig = {
      billing: { component: 'CommunityTrialNotice', requiredCapability: 'community.billing' },
      offen: { component: 'Offen' },
    }
    // Ohne Capability bleibt nur der ungegatete Eintrag stehen …
    expect(resolveAdminNotices(notices, NONE)).toEqual([{ id: 'offen', component: 'Offen' }])
    // … mit genau dieser Capability erscheint er.
    const only = (granted: Capability) => (capability: Capability) => capability === granted
    expect(resolveAdminNotices(notices, only('community.billing')).map(n => n.id)).toEqual(['billing', 'offen'])
  })
})
