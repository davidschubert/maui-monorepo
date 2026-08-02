import { describe, expect, it } from 'vitest'
import {
  COMMUNITY_SUSPENDED_CODE,
  communityIsOffline,
  communityIsReadOnly,
  memberWritesAllowedFor,
  resolveCommunitySuspension,
} from '../shared/communitySuspension'

/**
 * Die Sperr-Regeln (M13), festgenagelt. An diesen fünf Funktionen hängen drei
 * Stellen, die sich einig sein müssen — Resolver, Datentür und Oberfläche.
 */
describe('resolveCommunitySuspension (fail-open)', () => {
  it('erkennt genau die zwei echten Werte', () => {
    expect(resolveCommunitySuspension('billing')).toBe('billing')
    expect(resolveCommunitySuspension('abuse')).toBe('abuse')
  })

  it('liest Bestand ohne Spalte als „nicht gesperrt"', () => {
    // Appwrite backfillt Spalten-Defaults nicht: Rows von vor control-034
    // lesen sich als null.
    expect(resolveCommunitySuspension(null)).toBe('')
    expect(resolveCommunitySuspension(undefined)).toBe('')
    expect(resolveCommunitySuspension('')).toBe('')
  })

  it('nimmt einen krummen Wert NICHT als Sperre — lieber eine Mahnung zu wenig als eine Community zu Unrecht aus', () => {
    expect(resolveCommunitySuspension('abusive')).toBe('')
    expect(resolveCommunitySuspension('BILLING')).toBe('')
    expect(resolveCommunitySuspension('true')).toBe('')
  })
})

describe('Wirkung der beiden Stufen', () => {
  it('offline ist NUR abuse', () => {
    expect(communityIsOffline('abuse')).toBe(true)
    expect(communityIsOffline('billing')).toBe(false)
    expect(communityIsOffline('')).toBe(false)
  })

  it('nur-lesend ist jede Sperre — abuse defensiv mit drin', () => {
    expect(communityIsReadOnly('billing')).toBe(true)
    expect(communityIsReadOnly('abuse')).toBe(true)
    expect(communityIsReadOnly('')).toBe(false)
  })
})

describe('memberWritesAllowedFor (die Frage der Datentür)', () => {
  it('lässt ohne Mandanten schreiben — Silo, Kontroll-Host, Playground', () => {
    expect(memberWritesAllowedFor(null)).toBe(true)
    expect(memberWritesAllowedFor({})).toBe(true)
  })

  it('schließt bei jeder Sperre zu', () => {
    expect(memberWritesAllowedFor({ suspension: 'billing' })).toBe(false)
    expect(memberWritesAllowedFor({ suspension: 'abuse' })).toBe(false)
    expect(memberWritesAllowedFor({ suspension: '' })).toBe(true)
  })
})

describe('Fehler-Schlüssel', () => {
  it('bleibt stabil — der Client liest ihn als error.data.reason', () => {
    expect(COMMUNITY_SUSPENDED_CODE).toBe('community_suspended')
  })
})
