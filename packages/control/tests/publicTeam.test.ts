import { describe, expect, it } from 'vitest'
import { publicTeamFrom } from '../shared/communityTeam'
import type { CommunityMemberStatus } from '../shared/types/communityMember'

/**
 * F1 Stufe 3 — die öffentliche Team-Sicht.
 *
 * Das ist die eigentliche Sicherheitsaussage der ganzen Naht: „nur diese
 * Rollen, nur diese Felder, nur mit Zugang". Sie steht deshalb als PURE Regel
 * da und wird hier festgenagelt — eine Route kann man beim nächsten Mal um ein
 * Feld erweitern, ohne dass jemand hinsieht.
 */
function member(
  runtimeUserId: string,
  role: string,
  status: CommunityMemberStatus = 'active',
) {
  return { runtimeUserId, role, status }
}

describe('publicTeamFrom — welche Rollen', () => {
  it('nimmt Leitung und Moderation', () => {
    const team = publicTeamFrom([
      member('u-owner', 'owner'),
      member('u-admin', 'admin'),
      member('u-mod', 'moderator'),
    ])
    expect(team.map(m => m.runtimeUserId)).toEqual(['u-owner', 'u-admin', 'u-mod'])
  })

  it('GEGENPROBE: Redakteure und Betrachter erscheinen NICHT', () => {
    // Sie mitzuzählen hieße, die Mitgliederliste einer Community zu
    // veröffentlichen — eine völlig andere Zusage als „wer ist ansprechbar".
    const team = publicTeamFrom([
      member('u-editor', 'editor'),
      member('u-viewer', 'viewer'),
    ])
    expect(team).toEqual([])
  })

  it('GEGENPROBE: eine unbekannte oder verfälschte Rolle fällt heraus', () => {
    expect(publicTeamFrom([member('u-x', 'superadmin'), member('u-y', '')])).toEqual([])
  })
})

describe('publicTeamFrom — wer keinen Zugang mehr hat, ist kein Ansprechpartner', () => {
  it('entfernte Mitglieder fallen heraus, auch als frühere Moderatoren', () => {
    const team = publicTeamFrom([
      member('u-mod', 'moderator', 'removed'),
      member('u-admin', 'admin', 'active'),
    ])
    expect(team.map(m => m.runtimeUserId)).toEqual(['u-admin'])
  })

  it('GEGENPROBE: eine Zeile ohne Runtime-Id ist unbrauchbar und fällt heraus', () => {
    // Ohne sie könnte die Runtime weder Namen noch Bild auflösen — es entstünde
    // eine namenlose Zeile.
    expect(publicTeamFrom([member('', 'owner')])).toEqual([])
  })
})

describe('publicTeamFrom — welche Felder', () => {
  it('liefert AUSSCHLIESSLICH Id, Rolle, Name und Bild — nie eine Adresse', () => {
    const team = publicTeamFrom([
      { ...member('u-owner', 'owner'), email: 'chef@example.com', joinedAt: '2026-01-01' } as never,
    ])
    expect(team).toEqual([{ runtimeUserId: 'u-owner', role: 'owner', name: '', avatarUrl: '' }])
    // Der ausdrückliche Nachweis: kein Feld der Eingabe rutscht durch.
    expect(Object.keys(team[0]!).sort()).toEqual(['avatarUrl', 'name', 'role', 'runtimeUserId'])
    expect(JSON.stringify(team)).not.toContain('example.com')
  })

  it('Name und Bild bleiben leer — sie gehören der Runtime, nicht dem Control Plane', () => {
    const team = publicTeamFrom([member('u-owner', 'owner')])
    expect(team[0]!.name).toBe('')
    expect(team[0]!.avatarUrl).toBe('')
  })
})

describe('publicTeamFrom — Reihenfolge', () => {
  it('ordnet nach Rolle (Leitung vor Moderation), nicht nach Beitritt', () => {
    const team = publicTeamFrom([
      member('u-mod', 'moderator'),
      member('u-admin', 'admin'),
      member('u-owner', 'owner'),
    ])
    expect(team.map(m => m.role)).toEqual(['owner', 'admin', 'moderator'])
  })

  it('mehrere derselben Rolle behalten ihre Eingangsreihenfolge', () => {
    const team = publicTeamFrom([
      member('u-mod-1', 'moderator'),
      member('u-mod-2', 'moderator'),
    ])
    expect(team.map(m => m.runtimeUserId)).toEqual(['u-mod-1', 'u-mod-2'])
  })
})
