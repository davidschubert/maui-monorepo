import { describe, expect, it } from 'vitest'
import { decideCommunityAccess } from '../../core/shared/communityAccess'
import { COMMUNITY_ROLES, communityRoleHasCapability, type CommunityRole } from '../../core/shared/communityAuthz'

/**
 * F15 — wer darf Termine moderieren?
 *
 * Die neue Capability `events.moderate` steht im MODERATOR-Bündel, `events.manage`
 * (Termine verfassen) bleibt beim EDITOR. Diese Suite hält genau diese Trennung
 * fest: sie ist der Grund, warum die Queue eine eigene Seite mit eigenem
 * Nav-Eintrag hat und kein Abschnitt in `/dashboard/events` ist.
 */

const allow = (role: CommunityRole | null, labels: string[] = []) =>
  decideCommunityAccess({ capability: 'events.moderate', tenantScoped: true, role, labels })

describe('Termine moderieren im Pool: die Site-Rolle entscheidet', () => {
  it('lässt Owner, Admin und Moderator moderieren — ganz ohne globales Label', () => {
    for (const role of ['owner', 'admin', 'moderator'] as const) {
      expect(allow(role), role).toEqual({ allowed: true, via: 'role', role })
    }
  })

  it('lässt Editor und Viewer NICHT moderieren (verfassen ≠ moderieren)', () => {
    expect(allow('editor')).toEqual({ allowed: false, reason: 'insufficient-role' })
    expect(allow('viewer')).toEqual({ allowed: false, reason: 'insufficient-role' })
  })

  it('weist ab, wer in DIESER Community keine Rolle hat', () => {
    expect(allow(null)).toEqual({ allowed: false, reason: 'no-role' })
  })

  it('deckt die ganze Rollen-Matrix ab (neue Rolle ⇒ dieser Test bricht)', () => {
    const verdicts = Object.fromEntries(COMMUNITY_ROLES.map(role => [role, allow(role).allowed]))
    expect(verdicts).toEqual({ owner: true, admin: true, moderator: true, editor: false, viewer: false })
  })
})

describe('events.manage und events.moderate sind Geschwister, kein Chain', () => {
  it('der Editor verfasst Termine, moderiert sie aber nicht', () => {
    expect(communityRoleHasCapability('editor', 'events.manage')).toBe(true)
    expect(communityRoleHasCapability('editor', 'events.moderate')).toBe(false)
  })

  it('der Moderator moderiert Termine, verfasst sie aber nicht', () => {
    expect(communityRoleHasCapability('moderator', 'events.moderate')).toBe(true)
    expect(communityRoleHasCapability('moderator', 'events.manage')).toBe(false)
  })

  it('Admin und Owner halten BEIDE — sie sehen beide Menüpunkte', () => {
    for (const role of ['admin', 'owner'] as const) {
      expect(communityRoleHasCapability(role, 'events.manage'), role).toBe(true)
      expect(communityRoleHasCapability(role, 'events.moderate'), role).toBe(true)
    }
  })

  it('genau darum ist die Queue eine eigene Seite', () => {
    // Läge der Moderations-Abschnitt in `/dashboard/events` (Gate:
    // `events.manage`), käme der Moderator gar nicht erst auf die Seite — die
    // Capability hätte keine Fläche (Audit-Befund S9, „tote Capability").
    expect(communityRoleHasCapability('moderator', 'events.manage')).toBe(false)
    expect(communityRoleHasCapability('moderator', 'events.moderate')).toBe(true)
  })
})

describe('Operator-Break-Glass bleibt der zweite Weg — und wird protokolliert', () => {
  it('lässt das globale admin-Label auf eine Kunden-Community durch, gemeldet als operator', () => {
    expect(allow(null, ['admin'])).toEqual({ allowed: true, via: 'operator' })
  })

  it('hilft dem globalen moderator-Label NICHT über events.moderate', () => {
    // Dieselbe bewusste Asymmetrie wie bei posts.moderate: die SITE-Rolle
    // `moderator` hält die Capability, das OPERATOR-Label `moderator` nicht
    // (authz.ts kennt dort nur comments/reports/tickets).
    expect(allow(null, ['moderator'])).toEqual({ allowed: false, reason: 'no-role' })
  })

  it('meldet die Rolle, wenn der Betreiber ohnehin Mitglied ist (kein Fehlalarm im Log)', () => {
    expect(allow('moderator', ['admin'])).toEqual({ allowed: true, via: 'role', role: 'moderator' })
  })
})
