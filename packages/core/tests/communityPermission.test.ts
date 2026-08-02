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
  // Ebenfalls Auto-Import: der Break-Glass-Pfad protokolliert (G1: „kein
  // stiller Dauer-Bypass"). Im Node-Test ein No-Op — geprüft wird hier die
  // Entscheidung, nicht das Log.
  ;(globalThis as { logEvent?: (...args: unknown[]) => void }).logEvent = () => {}
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

/**
 * WER HANDELT KOMMT MIT (F17, 2026-08-01) — die Redaktions-Routen (Kurs,
 * Lektion, Termin, Seite) brauchen den Admin-Client aus technischen Gründen und
 * müssen der Datentür trotzdem sagen, dass ein Mensch DIESER Community handelt.
 * Raten dürfen sie das nicht: nur der Gate weiß, ob der Zugriff über die Rolle
 * oder über das Betreiber-Break-Glass zustande kam.
 */
describe('requireCommunityPermission liefert den Handelnden mit', () => {
  it('über die Rolle ⇒ actor member (Inhalts-Sperre und Beitritt gelten)', async () => {
    registerCommunityRoleResolver(() => 'editor')
    const result = await requireCommunityPermission(fakeEvent({ user, tenant }), 'posts.write')
    expect(result.via).toBe('role')
    expect(result.actor).toBe('member')
  })

  it('über das Break-Glass ⇒ actor operator — der Betreiber tritt NICHT bei', async () => {
    // Der Fall, der ein pauschales `actor: 'member'` an den Redaktions-Routen
    // verbietet: sonst stünde der Betreiber nach einem Support-Eingriff als
    // `viewer` in der Mitgliederliste seines Kunden.
    registerCommunityRoleResolver(() => null)
    const operator = { $id: 'operator-1', labels: ['admin'] }
    const result = await requireCommunityPermission(fakeEvent({ user: operator, tenant }), 'pages.manage')
    expect(result.via).toBe('operator')
    expect(result.actor).toBe('operator')
  })

  it('ohne Mandanten (Silo) ⇒ actor operator, Verhalten unverändert', async () => {
    const operator = { $id: 'operator-1', labels: ['admin'] }
    const result = await requireCommunityPermission(fakeEvent({ user: operator }), 'pages.manage')
    expect(result.via).toBe('single-tenant')
    expect(result.actor).toBe('operator')
  })
})
