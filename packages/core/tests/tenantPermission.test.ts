import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  requireTenantPermission,
  resolveTenantRole,
  registerSiteRoleResolver,
  __resetSiteRoleResolver,
  type SiteRoleResolver,
} from '../server/utils/tenantPermission'

// Nitro stellt createError global bereit (Auto-Import). h3 ist keine direkte
// core-Dependency → im Node-Test ein minimaler Stub, der status/statusText
// als werfbares Fehlerobjekt trägt (genügt für den Gate-Kontrakt).
beforeAll(() => {
  ;(globalThis as { createError?: (input: { status?: number, statusText?: string }) => Error }).createError
    = (input) => {
      const err = new Error(input.statusText ?? 'Error') as Error & { status?: number, statusCode?: number }
      err.status = input.status
      err.statusCode = input.status
      return err
    }
})

afterEach(() => {
  __resetSiteRoleResolver()
  vi.restoreAllMocks()
})

/** Minimaler H3Event-Stub: nur der context zählt. */
function fakeEvent(ctx: { user?: unknown, tenant?: unknown }): H3Event {
  return { context: ctx } as unknown as H3Event
}

const user = { $id: 'runtime-user-1', labels: [] }
const tenant = { mode: 'pool' as const, projectId: 'pool-proj', tenantId: 't-1', siteId: 'site-1' }

async function status(fn: () => Promise<unknown>): Promise<number> {
  try {
    await fn()
    return 0
  }
  catch (error) {
    const e = error as { statusCode?: number, status?: number }
    return e.statusCode ?? e.status ?? -1
  }
}

describe('resolveTenantRole (fail-closed)', () => {
  it('ohne User → null', async () => {
    registerSiteRoleResolver(() => 'owner')
    expect(await resolveTenantRole(fakeEvent({ tenant }))).toBeNull()
  })
  it('ohne Tenant/siteId → null', async () => {
    registerSiteRoleResolver(() => 'owner')
    expect(await resolveTenantRole(fakeEvent({ user }))).toBeNull()
    expect(await resolveTenantRole(fakeEvent({ user, tenant: { mode: 'pool', projectId: 'p', tenantId: 't' } }))).toBeNull()
  })
  it('ohne registrierten Resolver → null', async () => {
    expect(await resolveTenantRole(fakeEvent({ user, tenant }))).toBeNull()
  })
  it('unbekannte gespeicherte Rolle → null (Cross-Check gegen Katalog)', async () => {
    registerSiteRoleResolver(() => 'superuser')
    expect(await resolveTenantRole(fakeEvent({ user, tenant }))).toBeNull()
  })
  it('gültige Rolle → durchgereicht', async () => {
    registerSiteRoleResolver(() => 'moderator')
    expect(await resolveTenantRole(fakeEvent({ user, tenant }))).toBe('moderator')
  })
  it('reicht den korrekten Lookup an den Resolver', async () => {
    const spy = vi.fn<SiteRoleResolver>(() => 'admin')
    registerSiteRoleResolver(spy)
    await resolveTenantRole(fakeEvent({ user, tenant }))
    expect(spy).toHaveBeenCalledWith({ siteId: 'site-1', runtimeProjectId: 'pool-proj', runtimeUserId: 'runtime-user-1' })
  })
})

describe('requireTenantPermission', () => {
  it('ohne User → 401', async () => {
    registerSiteRoleResolver(() => 'owner')
    expect(await status(() => requireTenantPermission(fakeEvent({ tenant }), 'posts.write'))).toBe(401)
  })
  it('kein Mitglied → 403', async () => {
    registerSiteRoleResolver(() => null)
    expect(await status(() => requireTenantPermission(fakeEvent({ user, tenant }), 'posts.write'))).toBe(403)
  })
  it('Rolle ohne die Capability → 403 (editor darf nicht moderieren)', async () => {
    registerSiteRoleResolver(() => 'editor')
    expect(await status(() => requireTenantPermission(fakeEvent({ user, tenant }), 'comments.moderate'))).toBe(403)
  })
  it('Rolle mit der Capability → gibt user + role zurück', async () => {
    registerSiteRoleResolver(() => 'editor')
    const result = await requireTenantPermission(fakeEvent({ user, tenant }), 'posts.write')
    expect(result.role).toBe('editor')
    expect(result.user).toBe(user)
  })
  it('owner darf Owner-Aktionen, admin nicht', async () => {
    registerSiteRoleResolver(() => 'owner')
    expect(await status(() => requireTenantPermission(fakeEvent({ user, tenant }), 'site.delete'))).toBe(0)
    __resetSiteRoleResolver()
    registerSiteRoleResolver(() => 'admin')
    expect(await status(() => requireTenantPermission(fakeEvent({ user, tenant }), 'site.delete'))).toBe(403)
  })
})
