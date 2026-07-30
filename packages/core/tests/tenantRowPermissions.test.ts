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
