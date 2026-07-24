import { Client, ID, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import { createTenantsTableResolver, mapTenantRowToContext } from '../server/utils/tenantsResolver'
import { TENANTS_TABLE, parseTenantPlanLimits } from '../shared/types/tenantRecord'

describe('mapTenantRowToContext (pure)', () => {
  it('active silo → silo-Context', () => {
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'active', plan: '' }))
      .toEqual({ mode: 'silo', projectId: 'p1' })
  })
  it('active pool → pool-Context mit tenantId + Plan-Default free', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: '' }))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'free' })
  })
  it('disabled → null (Host bewusst offline)', () => {
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'disabled', plan: '' })).toBeNull()
  })
  it('pool OHNE tenantId → null (nie ungescoped durchlassen)', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: '', status: 'active', plan: '' })).toBeNull()
  })
  it('kein Row → null', () => {
    expect(mapTenantRowToContext(null)).toBeNull()
  })
  it('Plan-Katalog: Limits des Plans reisen aufgelöst im Context', () => {
    const catalog = {
      free: { comments: { perDay: 200, total: 5000 } },
      pro: { comments: { perDay: 1000, total: 50000 } },
    }
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'pro' }, catalog))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'pro', limits: { comments: { perDay: 1000, total: 50000 } } })
  })
  it('Plan-Katalog: unbekannter Plan fällt auf free zurück', () => {
    const catalog = { free: { comments: { perDay: 200 } } }
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'enterprise' as never }, catalog))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'enterprise', limits: { comments: { perDay: 200 } } })
  })
  it('leerer Katalog: Context ohne limits (app.config-Fallback greift)', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active', plan: 'pro' }, {}))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1', plan: 'pro' })
  })
})

describe('parseTenantPlanLimits (pure, defensiv)', () => {
  it('parst gültiges Limits-JSON', () => {
    expect(parseTenantPlanLimits('{"comments":{"perDay":200,"total":5000}}'))
      .toEqual({ comments: { perDay: 200, total: 5000 } })
  })
  it('kaputtes JSON → {}', () => {
    expect(parseTenantPlanLimits('nope{')).toEqual({})
  })
  it('fremde/negative Werte werden verworfen, gültige bleiben', () => {
    expect(parseTenantPlanLimits('{"comments":{"perDay":-5,"total":100,"x":"y"},"posts":"kaputt","pages":{"perDay":3}}'))
      .toEqual({ comments: { total: 100 }, pages: { perDay: 3 } })
  })
  it('Array/Skalar → {}', () => {
    expect(parseTenantPlanLimits('[1,2]')).toEqual({})
    expect(parseTenantPlanLimits('42')).toEqual({})
  })
})

/**
 * Integration gegen eine ECHTE Appwrite (tenants-Table, Migration studio-010).
 * Env-gated wie die anderen Live-Tests: Env der studio-App exportieren.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

describe.skipIf(!hasEnv)('createTenantsTableResolver (echte Appwrite)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []
  const HOST_POOL = `pool-${Date.now()}.test.local`
  const HOST_OFF = `off-${Date.now()}.test.local`

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: TENANTS_TABLE, rowId: id }).catch(() => {})
    }
  })

  it('löst pool/disabled/unknown korrekt auf und cached (positiv wie negativ)', async () => {
    const poolRow = await tablesDB.createRow({
      databaseId: databaseId!, tableId: TENANTS_TABLE, rowId: ID.unique(),
      data: { host: HOST_POOL, mode: 'pool', projectId: 'shared-project', tenantId: 't-demo', status: 'active' },
    })
    createdIds.push(poolRow.$id)
    const offRow = await tablesDB.createRow({
      databaseId: databaseId!, tableId: TENANTS_TABLE, rowId: ID.unique(),
      data: { host: HOST_OFF, mode: 'silo', projectId: 'p-off', tenantId: '', status: 'disabled' },
    })
    createdIds.push(offRow.$id)

    const resolve = createTenantsTableResolver({
      endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs: 60_000,
    })

    // Seit studio-014 reisen die Katalog-Limits (tenant_plans) im Context mit —
    // Plan-Default free, Limits aus dem Seed/aktuellen Katalog (Zahlen variabel,
    // Studio-editierbar: nur Struktur prüfen, nicht die konkreten Werte).
    const resolved = await resolve(HOST_POOL)
    expect(resolved).toMatchObject({ mode: 'pool', projectId: 'shared-project', tenantId: 't-demo', plan: 'free' })
    if (resolved?.mode === 'pool' && resolved.limits) {
      expect(resolved.limits.comments?.perDay).toBeTypeOf('number')
    }
    await expect(resolve(HOST_OFF)).resolves.toBeNull()
    await expect(resolve('gibt-es-nicht.test.local')).resolves.toBeNull()

    // Cache-Beweis: Row ändern — innerhalb der TTL bleibt die ALTE Auflösung
    await tablesDB.updateRow({ databaseId: databaseId!, tableId: TENANTS_TABLE, rowId: poolRow.$id, data: { status: 'disabled' } })
    await expect(resolve(HOST_POOL)).resolves.toEqual(resolved)
  })
})
