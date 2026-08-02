import { describe, it, expect } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import { tenantReadRolesFor, tenantRowPermissionsFor } from '../server/utils/tenantRowPermissions'
import type { TenantContext } from '../shared/types/tenant'

const pool: TenantContext = { mode: 'pool', projectId: 'shared', tenantId: 't-1', communityId: 'siteAAA' }
const poolOther: TenantContext = { mode: 'pool', projectId: 'shared', tenantId: 't-2', communityId: 'siteBBB' }
const poolNoSite: TenantContext = { mode: 'pool', projectId: 'shared', tenantId: 't-x' }
const silo: TenantContext = { mode: 'silo', projectId: 'p-silo', communityId: 'siteCCC' }

describe('tenantReadRolesFor', () => {
  it('pool + members → read(label(communityId)) — die harte Grenze', () => {
    expect(tenantReadRolesFor(pool, 'members')).toEqual([Permission.read(Role.label('siteAAA'))])
  })
  it('zwei Pool-Sites bekommen VERSCHIEDENE Read-Labels (Isolation)', () => {
    const a = tenantReadRolesFor(pool, 'members')
    const b = tenantReadRolesFor(poolOther, 'members')
    expect(a).not.toEqual(b)
  })
  it('pool ohne communityId → fail-closed: KEIN Read (nie versehentlich öffentlich)', () => {
    expect(tenantReadRolesFor(poolNoSite, 'members')).toEqual([])
  })
  it('public → read(any), egal welcher Modus', () => {
    expect(tenantReadRolesFor(pool, 'public')).toEqual([Permission.read(Role.any())])
    expect(tenantReadRolesFor(silo, 'public')).toEqual([Permission.read(Role.any())])
    expect(tenantReadRolesFor(null, 'public')).toEqual([Permission.read(Role.any())])
  })
  it('silo/single-tenant + members → read(users) (Projekt ist die Grenze)', () => {
    expect(tenantReadRolesFor(silo, 'members')).toEqual([Permission.read(Role.users())])
    expect(tenantReadRolesFor(null, 'members')).toEqual([Permission.read(Role.users())])
  })
})

describe('tenantRowPermissionsFor', () => {
  it('Default = members (fail-safe, nicht öffentlich)', () => {
    expect(tenantRowPermissionsFor(pool)).toEqual([Permission.read(Role.label('siteAAA'))])
  })
  it('Owner bekommt update + delete', () => {
    const perms = tenantRowPermissionsFor(pool, { ownerUserId: 'u-1' })
    expect(perms).toContain(Permission.read(Role.label('siteAAA')))
    expect(perms).toContain(Permission.update(Role.user('u-1')))
    expect(perms).toContain(Permission.delete(Role.user('u-1')))
  })
  it('extraRead (Operator/Moderation) wird additiv angehängt', () => {
    const perms = tenantRowPermissionsFor(pool, {
      read: 'members',
      extraRead: [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))],
    })
    expect(perms).toContain(Permission.read(Role.label('siteAAA')))
    expect(perms).toContain(Permission.read(Role.label('admin')))
    expect(perms).toContain(Permission.read(Role.label('moderator')))
  })
  it('dedupliziert doppelte Rollen', () => {
    const perms = tenantRowPermissionsFor(pool, {
      extraRead: [Permission.read(Role.label('siteAAA'))], // == Member-Read
    })
    expect(perms.filter(p => p === Permission.read(Role.label('siteAAA')))).toHaveLength(1)
  })
  it('public + Owner: jede/r liest, nur Owner ändert', () => {
    const perms = tenantRowPermissionsFor(pool, { read: 'public', ownerUserId: 'u-9' })
    expect(perms).toEqual([
      Permission.read(Role.any()),
      Permission.update(Role.user('u-9')),
      Permission.delete(Role.user('u-9')),
    ])
  })
})

/**
 * Moderations-Audit Befund 1 — das Publikum 'moderators'.
 *
 * Es gibt genau eine Menge Menschen, die eine Meldung lesen darf: das Team
 * DIESER Community. Appwrite kennt aber nur ODER-Rollen, also braucht der
 * Schnitt „Moderator UND diese Community" einen eigenen Schlüssel. Hier wird
 * beides bewiesen: dass er gezogen wird — und dass er die falschen beiden
 * Alternativen NICHT ist (Mitglieder-Label / globale Betreiber-Rollen).
 */
describe("tenantReadRolesFor + 'moderators'", () => {
  it('Pool: das Moderations-Label DIESER Community, sonst nichts', () => {
    expect(tenantReadRolesFor(pool, 'moderators')).toEqual([Permission.read(Role.label('modsiteAAA'))])
  })

  it('…und ausdrücklich NICHT das Mitglieder-Label (eine Meldung ist kein Inhalt)', () => {
    expect(tenantReadRolesFor(pool, 'moderators')).not.toContain(Permission.read(Role.label('siteAAA')))
  })

  it('…und ausdrücklich NICHT die globalen Betreiber-Rollen (der Befund selbst)', () => {
    const roles = tenantReadRolesFor(pool, 'moderators')
    expect(roles).not.toContain(Permission.read(Role.label('admin')))
    expect(roles).not.toContain(Permission.read(Role.label('moderator')))
  })

  it('zwei Pool-Communities bekommen VERSCHIEDENE Moderations-Labels', () => {
    expect(tenantReadRolesFor(pool, 'moderators')).not.toEqual(tenantReadRolesFor(poolOther, 'moderators'))
  })

  it('Pool ohne communityId → fail-closed: KEIN Read', () => {
    expect(tenantReadRolesFor(poolNoSite, 'moderators')).toEqual([])
  })

  it('Silo/Single-Tenant: die globalen Betreiber-Rollen (Projekt = Grenze)', () => {
    const expected = [Permission.read(Role.label('admin')), Permission.read(Role.label('moderator'))]
    expect(tenantReadRolesFor(silo, 'moderators')).toEqual(expected)
    expect(tenantReadRolesFor(null, 'moderators')).toEqual(expected)
  })

  it('eine OFFENE Community macht Meldungen nicht öffentlich (C18 gilt hier nicht)', () => {
    expect(tenantReadRolesFor({ ...pool, audience: 'public' }, 'moderators'))
      .toEqual([Permission.read(Role.label('modsiteAAA'))])
    expect(tenantReadRolesFor({ ...silo, audience: 'public' }, 'moderators'))
      .not.toContain(Permission.read(Role.any()))
  })
})

/**
 * C18 — die WAHL DER COMMUNITY schlägt die ABSICHT DER ZEILE. Das ist die
 * Zeile, wegen der der Schalter überhaupt wirkt, ohne dass die Schreib-Routen
 * ihn kennen müssen.
 */
describe('tenantReadRolesFor + audience (C18)', () => {
  const poolClosed: TenantContext = { ...pool, audience: 'members' }
  const poolOpen: TenantContext = { ...pool, audience: 'public' }
  const siloClosed: TenantContext = { ...silo, audience: 'members' }

  it("geschlossene Community: aus 'public' wird das Mitglieder-Publikum", () => {
    expect(tenantReadRolesFor(poolClosed, 'public')).toEqual([Permission.read(Role.label('siteAAA'))])
    expect(tenantReadRolesFor(siloClosed, 'public')).toEqual([Permission.read(Role.users())])
  })
  it("offene Community: 'public' bleibt read(any)", () => {
    expect(tenantReadRolesFor(poolOpen, 'public')).toEqual([Permission.read(Role.any())])
  })
  it('ohne audience-Feld (Silo, Playground, Bestands-Fixture) bleibt alles wie bisher', () => {
    expect(tenantReadRolesFor(pool, 'public')).toEqual([Permission.read(Role.any())])
    expect(tenantReadRolesFor(null, 'public')).toEqual([Permission.read(Role.any())])
  })
  it('umgekehrt NIE: eine offene Community macht mitglieder-interne Zeilen nicht öffentlich', () => {
    expect(tenantReadRolesFor(poolOpen, 'members')).toEqual([Permission.read(Role.label('siteAAA'))])
  })
  it('geschlossene Community ohne communityId → fail-closed, KEIN Read', () => {
    expect(tenantReadRolesFor({ ...poolNoSite, audience: 'members' }, 'public')).toEqual([])
  })
})
