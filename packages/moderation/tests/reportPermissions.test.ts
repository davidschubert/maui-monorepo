import { describe, expect, it } from 'vitest'
import { Permission, Role } from 'node-appwrite'
import { reportRowPermissionOptions, reporterReadRole } from '../shared/reportPermissions'
import { tenantRowPermissionsFor } from '../../core/server/utils/tenantRowPermissions'
import type { TenantContext } from '../../core/shared/types/tenant'

/**
 * Moderations-Audit Befund 1 (2026-08-01) — DIE GRENZE EINER MELDUNG,
 * an `tenantRowPermissionsFor` genagelt (Muster: presencePermissions.test.ts).
 *
 * Der Befund: `/api/reports` baute seine Row-Permissions selbst und setzte die
 * GLOBALEN Betreiber-Labels. Damit war `reports` die einzige Pool-Tabelle ohne
 * die zweite Verteidigungslinie — ein Betreiber-Label las per Realtime quer
 * durch alle Communities, und der Kunden-Moderator, dem die Queue gehört, hatte
 * gar kein Leserecht.
 *
 * Dieser Test prüft nicht „irgendwelche Permissions", sondern GENAU DIE, mit
 * denen die Route anlegt (reportRowPermissionOptions ist die einzige Quelle
 * beider Seiten) — und die drei Sätze, die die Grenze ausmachen.
 */
const REPORTER = 'u-melder'

const pool: TenantContext = { mode: 'pool', projectId: 'pool', tenantId: 't-1', communityId: 'siteAAA' }
const poolOther: TenantContext = { mode: 'pool', projectId: 'pool', tenantId: 't-2', communityId: 'siteBBB' }
const poolNoSite: TenantContext = { mode: 'pool', projectId: 'pool', tenantId: 't-x' }
const silo: TenantContext = { mode: 'silo', projectId: 'kunde-x', communityId: 'siteCCC' }

const permsFor = (tenant: TenantContext | null) =>
  tenantRowPermissionsFor(tenant, reportRowPermissionOptions(REPORTER))

describe('reporterReadRole == Permission.read(Role.user(id))', () => {
  it('reine String-Form deckt sich mit node-appwrite', () => {
    expect(reporterReadRole(REPORTER)).toBe(Permission.read(Role.user(REPORTER)))
  })
})

describe('Row-Permissions einer Meldung im POOL', () => {
  const perms = permsFor(pool)

  it('das Moderations-Team DIESER Community darf lesen', () => {
    expect(perms).toContain(Permission.read(Role.label('modsiteAAA')))
  })

  it('der Melder darf lesen — und zurückziehen (Befund 2)', () => {
    expect(perms).toContain(Permission.read(Role.user(REPORTER)))
    expect(perms).toContain(Permission.update(Role.user(REPORTER)))
    expect(perms).toContain(Permission.delete(Role.user(REPORTER)))
  })

  it('SONST NIEMAND: keine Mitglieder, keine Öffentlichkeit, keine globalen Labels', () => {
    expect(perms).not.toContain(Permission.read(Role.any()))
    expect(perms).not.toContain(Permission.read(Role.users()))
    // das Mitglieder-Publikum der Community — eine Meldung ist kein Inhalt
    expect(perms).not.toContain(Permission.read(Role.label('siteAAA')))
    // der eigentliche Befund: die globalen Betreiber-Rollen
    expect(perms).not.toContain(Permission.read(Role.label('admin')))
    expect(perms).not.toContain(Permission.read(Role.label('moderator')))
  })

  it('ein FREMDES Moderations-Team kommt nicht heran', () => {
    expect(perms).not.toContain(Permission.read(Role.label('modsiteBBB')))
    expect(permsFor(poolOther)).not.toContain(Permission.read(Role.label('modsiteAAA')))
  })

  it('genau vier Rechte — nichts Unbeabsichtigtes rutscht mit', () => {
    expect(perms).toHaveLength(4)
  })
})

describe('Row-Permissions einer Meldung ohne Pool-Community (Datenfehler)', () => {
  it('fail-closed: nur der Melder, kein Publikum', () => {
    const perms = permsFor(poolNoSite)
    expect(perms).toEqual([
      Permission.read(Role.user(REPORTER)),
      Permission.update(Role.user(REPORTER)),
      Permission.delete(Role.user(REPORTER)),
    ])
  })
})

describe('Row-Permissions einer Meldung im SILO / Single-Tenant', () => {
  it('dort sind die globalen Betreiber-Rollen richtig — das Projekt IST die Grenze', () => {
    for (const tenant of [silo, null]) {
      const perms = permsFor(tenant)
      expect(perms).toContain(Permission.read(Role.label('admin')))
      expect(perms).toContain(Permission.read(Role.label('moderator')))
      expect(perms).toContain(Permission.read(Role.user(REPORTER)))
      expect(perms).not.toContain(Permission.read(Role.any()))
      expect(perms).not.toContain(Permission.read(Role.users()))
    }
  })
})

describe('die Öffentlichkeits-Entscheidung der Community gilt hier NICHT (C18)', () => {
  it('auch die offenste Community macht Meldungen nicht öffentlich', () => {
    expect(permsFor({ ...pool, audience: 'public' })).not.toContain(Permission.read(Role.any()))
    expect(permsFor({ ...silo, audience: 'public' })).not.toContain(Permission.read(Role.any()))
  })
})
