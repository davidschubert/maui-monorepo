import { describe, expect, it } from 'vitest'
import {
  countActiveOwners,
  decideInvite,
  decideJoin,
  decideRemoval,
  decideRoleChange,
  decideTransfer,
  type CommunityTeamMemberFacts,
} from '../shared/communityTeam'

/**
 * Die Schutzregeln der Mitglieder-Verwaltung (control-019).
 *
 * Sie sind PURE, damit genau das hier möglich ist: die zwei Regeln, die eine
 * Community unbrauchbar machen könnten — „letzter Owner" und
 * „Selbst-Degradierung" — ohne Appwrite, Netz oder Session prüfen.
 */

const owner: CommunityTeamMemberFacts = { id: 'm1', runtimeUserId: 'u-owner', role: 'owner', status: 'active' }
const admin: CommunityTeamMemberFacts = { id: 'm2', runtimeUserId: 'u-admin', role: 'admin', status: 'active' }
const viewer: CommunityTeamMemberFacts = { id: 'm3', runtimeUserId: 'u-viewer', role: 'viewer', status: 'active' }
const secondOwner: CommunityTeamMemberFacts = { id: 'm4', runtimeUserId: 'u-owner2', role: 'owner', status: 'active' }
const removed: CommunityTeamMemberFacts = { id: 'm5', runtimeUserId: 'u-gone', role: 'editor', status: 'removed' }

const team = [owner, admin, viewer, removed]

describe('countActiveOwners', () => {
  it('zählt nur aktive Owner', () => {
    expect(countActiveOwners(team)).toBe(1)
    expect(countActiveOwners([...team, secondOwner])).toBe(2)
    expect(countActiveOwners([{ ...owner, status: 'removed' }])).toBe(0)
  })
})

describe('decideRoleChange', () => {
  it('erlaubt die gewöhnliche Änderung (Owner stuft Viewer zum Editor)', () => {
    expect(decideRoleChange({
      actorUserId: owner.runtimeUserId, actorRole: 'owner', target: viewer, nextRole: 'editor', members: team,
    })).toEqual({ ok: true })
  })

  it('verweigert SELBST-Degradierung — auch dem Owner', () => {
    expect(decideRoleChange({
      actorUserId: owner.runtimeUserId, actorRole: 'owner', target: owner, nextRole: 'admin', members: [...team, secondOwner],
    })).toEqual({ ok: false, reason: 'self_demote' })
    expect(decideRoleChange({
      actorUserId: admin.runtimeUserId, actorRole: 'admin', target: admin, nextRole: 'viewer', members: team,
    })).toEqual({ ok: false, reason: 'self_demote' })
  })

  it('schützt den LETZTEN Owner (nur ein Owner ⇒ nicht degradierbar)', () => {
    // Zweiter Owner degradiert den ersten: erlaubt, es bleibt einer.
    expect(decideRoleChange({
      actorUserId: secondOwner.runtimeUserId, actorRole: 'owner', target: owner, nextRole: 'admin',
      members: [...team, secondOwner],
    })).toEqual({ ok: true })
    // Gäbe es nur diesen einen Owner, ginge es nicht — hier über einen
    // Fremd-Owner geprüft, damit nicht die Selbst-Regel zuerst greift.
    expect(decideRoleChange({
      actorUserId: 'u-ghost', actorRole: 'owner', target: owner, nextRole: 'admin', members: team,
    })).toEqual({ ok: false, reason: 'last_owner' })
  })

  it('macht niemanden zum Owner (Besitz nur per Übergabe)', () => {
    expect(decideRoleChange({
      actorUserId: owner.runtimeUserId, actorRole: 'owner', target: admin, nextRole: 'owner', members: team,
    })).toEqual({ ok: false, reason: 'owner_protected' })
    // Auch ein Admin kann sich nicht selbst befördern.
    expect(decideRoleChange({
      actorUserId: admin.runtimeUserId, actorRole: 'admin', target: admin, nextRole: 'owner', members: team,
    })).toEqual({ ok: false, reason: 'owner_protected' })
  })

  it('lässt einen Admin den Owner nicht antasten', () => {
    expect(decideRoleChange({
      actorUserId: admin.runtimeUserId, actorRole: 'admin', target: owner, nextRole: 'viewer',
      members: [...team, secondOwner],
    })).toEqual({ ok: false, reason: 'owner_protected' })
  })

  it('weist Entfernte, unbekannte Rollen und Nicht-Änderungen ab', () => {
    expect(decideRoleChange({
      actorUserId: owner.runtimeUserId, actorRole: 'owner', target: removed, nextRole: 'viewer', members: team,
    })).toEqual({ ok: false, reason: 'not_a_member' })
    expect(decideRoleChange({
      actorUserId: owner.runtimeUserId, actorRole: 'owner', target: viewer, nextRole: 'superuser', members: team,
    })).toEqual({ ok: false, reason: 'invalid_role' })
    expect(decideRoleChange({
      actorUserId: owner.runtimeUserId, actorRole: 'owner', target: viewer, nextRole: 'viewer', members: team,
    })).toEqual({ ok: false, reason: 'unchanged' })
  })
})

describe('decideRemoval', () => {
  it('erlaubt das Entfernen eines gewöhnlichen Mitglieds', () => {
    expect(decideRemoval({
      actorUserId: admin.runtimeUserId, actorRole: 'admin', target: viewer, members: team,
    })).toEqual({ ok: true })
  })

  it('verweigert das Entfernen von SICH SELBST', () => {
    expect(decideRemoval({
      actorUserId: admin.runtimeUserId, actorRole: 'admin', target: admin, members: team,
    })).toEqual({ ok: false, reason: 'self_remove' })
  })

  it('schützt den letzten Owner — und Owner überhaupt vor Admins', () => {
    expect(decideRemoval({
      actorUserId: admin.runtimeUserId, actorRole: 'admin', target: owner, members: [...team, secondOwner],
    })).toEqual({ ok: false, reason: 'owner_protected' })
    expect(decideRemoval({
      actorUserId: 'u-ghost', actorRole: 'owner', target: owner, members: team,
    })).toEqual({ ok: false, reason: 'last_owner' })
    expect(decideRemoval({
      actorUserId: secondOwner.runtimeUserId, actorRole: 'owner', target: owner, members: [...team, secondOwner],
    })).toEqual({ ok: true })
  })

  it('entfernt niemanden zweimal', () => {
    expect(decideRemoval({
      actorUserId: owner.runtimeUserId, actorRole: 'owner', target: removed, members: team,
    })).toEqual({ ok: false, reason: 'not_a_member' })
  })
})

describe('decideTransfer', () => {
  it('nur ein Owner überträgt', () => {
    expect(decideTransfer({ actorUserId: owner.runtimeUserId, actorRole: 'owner', target: admin })).toEqual({ ok: true })
    expect(decideTransfer({ actorUserId: admin.runtimeUserId, actorRole: 'admin', target: viewer }))
      .toEqual({ ok: false, reason: 'owner_protected' })
  })

  it('nicht an sich selbst und nicht an Entfernte', () => {
    expect(decideTransfer({ actorUserId: owner.runtimeUserId, actorRole: 'owner', target: owner }))
      .toEqual({ ok: false, reason: 'unchanged' })
    expect(decideTransfer({ actorUserId: owner.runtimeUserId, actorRole: 'owner', target: removed }))
      .toEqual({ ok: false, reason: 'not_a_member' })
  })
})

describe('decideInvite', () => {
  const activeEmails = ['ada@example.test', 'Bob@Example.test']

  it('erlaubt eine neue Adresse', () => {
    expect(decideInvite({ email: 'neu@example.test', role: 'viewer', members: team, activeEmails }))
      .toEqual({ ok: true })
  })

  it('lehnt Doppel-Einladungen ab — Groß-/Kleinschreibung egal', () => {
    expect(decideInvite({ email: 'ADA@example.test', role: 'editor', members: team, activeEmails }))
      .toEqual({ ok: false, reason: 'already_member' })
    expect(decideInvite({ email: ' bob@example.test ', role: 'editor', members: team, activeEmails }))
      .toEqual({ ok: false, reason: 'already_member' })
  })

  it('lädt niemals als Owner ein', () => {
    expect(decideInvite({ email: 'neu@example.test', role: 'owner', members: team, activeEmails }))
      .toEqual({ ok: false, reason: 'owner_protected' })
  })

  it('weist unbekannte Rollen ab', () => {
    expect(decideInvite({ email: 'neu@example.test', role: 'superuser', members: team, activeEmails }))
      .toEqual({ ok: false, reason: 'invalid_role' })
  })
})

/**
 * A5 — „Beitritt" als Regel (Davids Entscheidung 1 vom 2026-07-29).
 *
 * Die drei Aussagen, an denen alles hängt und die man nicht per Hand nachprüfen
 * will: entzogener Zugang schlägt jeden Auslöser, geschlossene Community lässt
 * niemanden herein, und der Bestand kommt trotzdem durch.
 */
describe('decideJoin', () => {
  it('offene Community: der Auslöser macht Mitglied — mit der Rolle viewer', () => {
    for (const trigger of ['registration', 'contribution'] as const) {
      expect(decideJoin({ trigger, openRegistration: true, existing: null }))
        .toEqual({ outcome: 'joined', role: 'viewer' })
    }
  })

  it('geschlossene Community: KEIN Auto-Beitritt (nur Einladung)', () => {
    for (const trigger of ['registration', 'contribution'] as const) {
      expect(decideJoin({ trigger, openRegistration: false, existing: null }))
        .toEqual({ outcome: 'closed', role: null })
    }
  })

  it('entzogener Zugang schlägt JEDEN Auslöser — auch die Bestands-Übernahme', () => {
    for (const trigger of ['registration', 'contribution', 'legacy'] as const) {
      for (const openRegistration of [true, false]) {
        expect(decideJoin({ trigger, openRegistration, existing: removed }))
          .toEqual({ outcome: 'removed', role: null })
      }
    }
  })

  it('bestehendes Mitglied bleibt, was es ist (idempotent, Rolle unberührt)', () => {
    expect(decideJoin({ trigger: 'contribution', openRegistration: true, existing: admin }))
      .toEqual({ outcome: 'member', role: 'admin' })
    expect(decideJoin({ trigger: 'legacy', openRegistration: false, existing: owner }))
      .toEqual({ outcome: 'member', role: 'owner' })
  })

  it('Bestand („legacy") umgeht den Registrierungs-Schalter — und nur er', () => {
    expect(decideJoin({ trigger: 'legacy', openRegistration: false, existing: null }))
      .toEqual({ outcome: 'joined', role: 'viewer' })
  })

  it('ein suspendierter Zugang ist auch kein Zugang', () => {
    expect(decideJoin({
      trigger: 'contribution',
      openRegistration: true,
      existing: { ...viewer, status: 'suspended' },
    })).toEqual({ outcome: 'removed', role: null })
  })
})
