import { describe, expect, it } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import { presencePermissions, presenceReadRoles } from '../shared/presencePermissions'
import { tenantRowPermissionsFor } from '../server/utils/tenantRowPermissions'
import type { TenantContext } from '../shared/types/tenant'

/**
 * A4 („Presence-Grenze"): die Presence wird an ZWEI Stellen geschrieben —
 * server-seitig im Heartbeat (tenantRowPermissionsFor, node-appwrite) und
 * client-seitig per WS-Upsert (presencePermissions, reine Strings, weil der
 * Browser node-appwrite nicht laden kann). Der WS-Upsert ERSETZT die
 * Permissions; wichen die beiden Bauer voneinander ab, stünde die Grenze
 * zwischen zwei Heartbeats offen — deshalb sind sie hier aneinander genagelt.
 */
const pool: TenantContext = { mode: 'pool', projectId: 'pool', tenantId: 't-1', siteId: 'siteAAA' }
const poolNoSite: TenantContext = { mode: 'pool', projectId: 'pool', tenantId: 't-1' }
const silo: TenantContext = { mode: 'silo', projectId: 'kunde-x', siteId: 'siteBBB' }

const USER = 'u-42'
const server = (tenant: TenantContext | null) =>
  tenantRowPermissionsFor(tenant, { read: 'members', ownerUserId: USER })

describe('presenceReadRoles', () => {
  it('Pool: nur wer das Site-Label trägt', () => {
    expect(presenceReadRoles(true, 'siteAAA')).toEqual([Permission.read(Role.label('siteAAA'))])
  })

  it('Pool ohne siteId: KEIN read — fail-closed statt pool-weit offen', () => {
    expect(presenceReadRoles(true, null)).toEqual([])
    expect(presenceReadRoles(true, undefined)).toEqual([])
  })

  it('Silo/Single-Tenant: read("users") wie bisher (Projekt = Grenze)', () => {
    expect(presenceReadRoles(false, null)).toEqual([Permission.read(Role.users())])
    // siteId im Silo vorhanden, aber irrelevant — kein Label-Scoping
    expect(presenceReadRoles(false, 'siteBBB')).toEqual([Permission.read(Role.users())])
  })
})

describe('presencePermissions == tenantRowPermissionsFor (Client == Server)', () => {
  it('Pool', () => {
    expect(presencePermissions(true, pool.siteId, USER)).toEqual(server(pool))
  })

  it('Pool ohne siteId', () => {
    expect(presencePermissions(true, undefined, USER)).toEqual(server(poolNoSite))
  })

  it('Silo', () => {
    expect(presencePermissions(false, silo.siteId, USER)).toEqual(server(silo))
  })

  it('kein Mandanten-Kontext (Playground/Single-Tenant)', () => {
    expect(presencePermissions(false, null, USER)).toEqual(server(null))
  })

  it('Owner behält update/delete — sonst bricht der Realtime-Presence-Handler', () => {
    const perms = presencePermissions(true, 'siteAAA', USER)
    expect(perms).toContain(Permission.update(Role.user(USER)))
    expect(perms).toContain(Permission.delete(Role.user(USER)))
  })

  it('im Pool steht KEIN read("users") mehr (das war der Befund)', () => {
    expect(presencePermissions(true, 'siteAAA', USER)).not.toContain('read("users")')
    expect(server(pool)).not.toContain('read("users")')
  })
})
