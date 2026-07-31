import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  requireCommunityPermission,
  resolveCommunityRole,
  registerCommunityRoleResolver,
  __resetCommunityRoleResolver,
  type CommunityRoleResolver,
} from '../server/utils/communityPermission'

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
  __resetCommunityRoleResolver()
  vi.restoreAllMocks()
})

/** Minimaler H3Event-Stub: nur der context zählt. */
function fakeEvent(ctx: { user?: unknown, tenant?: unknown }): H3Event {
  return { context: ctx } as unknown as H3Event
}

const user = { $id: 'runtime-user-1', labels: [] }
const tenant = { mode: 'pool' as const, projectId: 'pool-proj', tenantId: 't-1', communityId: 'site-1' }

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

describe('resolveCommunityRole (fail-closed)', () => {
  it('ohne User → null', async () => {
    registerCommunityRoleResolver(() => 'owner')
    expect(await resolveCommunityRole(fakeEvent({ tenant }))).toBeNull()
  })
  it('ohne Tenant/communityId → null', async () => {
    registerCommunityRoleResolver(() => 'owner')
    expect(await resolveCommunityRole(fakeEvent({ user }))).toBeNull()
    expect(await resolveCommunityRole(fakeEvent({ user, tenant: { mode: 'pool', projectId: 'p', tenantId: 't' } }))).toBeNull()
  })
  it('ohne registrierten Resolver → null', async () => {
    expect(await resolveCommunityRole(fakeEvent({ user, tenant }))).toBeNull()
  })
  it('unbekannte gespeicherte Rolle → null (Cross-Check gegen Katalog)', async () => {
    registerCommunityRoleResolver(() => 'superuser')
    expect(await resolveCommunityRole(fakeEvent({ user, tenant }))).toBeNull()
  })
  it('gültige Rolle → durchgereicht', async () => {
    registerCommunityRoleResolver(() => 'moderator')
    expect(await resolveCommunityRole(fakeEvent({ user, tenant }))).toBe('moderator')
  })
  it('reicht den korrekten Lookup an den Resolver', async () => {
    const spy = vi.fn<CommunityRoleResolver>(() => 'admin')
    registerCommunityRoleResolver(spy)
    await resolveCommunityRole(fakeEvent({ user, tenant }))
    expect(spy).toHaveBeenCalledWith({ communityId: 'site-1', runtimeProjectId: 'pool-proj', runtimeUserId: 'runtime-user-1' })
  })
})

/**
 * Der Rollen-Pfad des EINEN Wächters (E8-4): dieselben Fälle, die vorher gegen
 * den toten Zwilling `requireTenantPermission` liefen. Der Nutzer trägt hier
 * bewusst KEINE Operator-Labels — damit ist der Break-Glass-Zweig aus, und was
 * bleibt, ist genau die Semantik, die der gelöschte Zwilling hatte. Den
 * Break-Glass selbst prüft communityAccess.test.ts pur.
 */
describe('requireCommunityPermission (Rollen-Pfad)', () => {
  it('ohne User → 401', async () => {
    registerCommunityRoleResolver(() => 'owner')
    expect(await status(() => requireCommunityPermission(fakeEvent({ tenant }), 'posts.write'))).toBe(401)
  })
  it('kein Mitglied → 403', async () => {
    registerCommunityRoleResolver(() => null)
    expect(await status(() => requireCommunityPermission(fakeEvent({ user, tenant }), 'posts.write'))).toBe(403)
  })
  it('Rolle ohne die Capability → 403 (editor darf nicht moderieren)', async () => {
    registerCommunityRoleResolver(() => 'editor')
    expect(await status(() => requireCommunityPermission(fakeEvent({ user, tenant }), 'comments.moderate'))).toBe(403)
  })
  it('Rolle mit der Capability → gibt user + role zurück', async () => {
    registerCommunityRoleResolver(() => 'editor')
    const result = await requireCommunityPermission(fakeEvent({ user, tenant }), 'posts.write')
    expect(result.role).toBe('editor')
    expect(result.user).toBe(user)
  })
  it('owner darf Owner-Aktionen, admin nicht', async () => {
    registerCommunityRoleResolver(() => 'owner')
    expect(await status(() => requireCommunityPermission(fakeEvent({ user, tenant }), 'community.delete'))).toBe(0)
    __resetCommunityRoleResolver()
    registerCommunityRoleResolver(() => 'admin')
    expect(await status(() => requireCommunityPermission(fakeEvent({ user, tenant }), 'community.delete'))).toBe(403)
  })
})
