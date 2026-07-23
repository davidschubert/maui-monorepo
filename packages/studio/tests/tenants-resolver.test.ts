import { Client, ID, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import { createTenantsTableResolver, mapTenantRowToContext } from '../server/utils/tenantsResolver'
import { TENANTS_TABLE } from '../shared/types/tenantRecord'

describe('mapTenantRowToContext (pure)', () => {
  it('active silo → silo-Context', () => {
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'active' }))
      .toEqual({ mode: 'silo', projectId: 'p1' })
  })
  it('active pool → pool-Context mit tenantId', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: 't-1', status: 'active' }))
      .toEqual({ mode: 'pool', projectId: 'shared', tenantId: 't-1' })
  })
  it('disabled → null (Host bewusst offline)', () => {
    expect(mapTenantRowToContext({ mode: 'silo', projectId: 'p1', tenantId: '', status: 'disabled' })).toBeNull()
  })
  it('pool OHNE tenantId → null (nie ungescoped durchlassen)', () => {
    expect(mapTenantRowToContext({ mode: 'pool', projectId: 'shared', tenantId: '', status: 'active' })).toBeNull()
  })
  it('kein Row → null', () => {
    expect(mapTenantRowToContext(null)).toBeNull()
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

    await expect(resolve(HOST_POOL)).resolves.toEqual({ mode: 'pool', projectId: 'shared-project', tenantId: 't-demo' })
    await expect(resolve(HOST_OFF)).resolves.toBeNull()
    await expect(resolve('gibt-es-nicht.test.local')).resolves.toBeNull()

    // Cache-Beweis: Row ändern — innerhalb der TTL bleibt die ALTE Auflösung
    await tablesDB.updateRow({ databaseId: databaseId!, tableId: TENANTS_TABLE, rowId: poolRow.$id, data: { status: 'disabled' } })
    await expect(resolve(HOST_POOL)).resolves.toEqual({ mode: 'pool', projectId: 'shared-project', tenantId: 't-demo' })
  })
})
