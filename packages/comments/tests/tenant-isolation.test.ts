import { Client, ID, Query, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import { scopeQueriesFor, scopeRowFor } from '../../core/server/utils/tenant'
import type { TenantContext } from '../../core/shared/types/tenant'

/**
 * Horizont-3 Etappe 4.1 — automatisierter ISOLATIONSBEWEIS gegen eine ECHTE
 * Appwrite-Instanz (Blueprint: „Tenant A sieht Tenant B nicht"): Rows werden
 * mit scopeRowFor(A/B) gestempelt und mit scopeQueriesFor(A) gelistet — es
 * dürfen ausschließlich A-Rows zurückkommen; der Silo-Pfad (tenant null)
 * bleibt ungefiltert (heutiges Verhalten).
 *
 * Env-gated wie der Realtime-Test: ohne Appwrite-Env (lokal ohne .env / reiner
 * Unit-Lauf) skippt die Suite. Lokal: Env der comments-App exportieren
 * (set -a; source apps/comments/.env) — in CI liefert e2e.yml die Instanz.
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

const TENANT_A: TenantContext = { mode: 'pool', tenantId: `t-iso-a-${Date.now()}` }
const TENANT_B: TenantContext = { mode: 'pool', tenantId: `t-iso-b-${Date.now()}` }
const TARGET = { targetId: `tenant-iso-${Date.now()}`, targetType: 'test' }

describe.skipIf(!hasEnv)('Pool-Isolationsbeweis (echte Appwrite, comments.tenantId)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []

  async function createComment(tenant: TenantContext | null, content: string): Promise<string> {
    const row = await tablesDB.createRow({
      databaseId: databaseId!,
      tableId: 'comments',
      rowId: ID.unique(),
      data: scopeRowFor(tenant, {
        ...TARGET,
        content,
        parentId: null,
        rootId: null,
        depth: 0,
        editedAt: null,
        authorId: 'tenant-iso-test',
        authorName: 'Isolationstest',
        upvotes: 0,
        downvotes: 0,
        score: 0,
        status: 'active',
      }),
    })
    createdIds.push(row.$id)
    return row.$id
  }

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: 'comments', rowId: id }).catch(() => {})
    }
  })

  it('Tenant A sieht ausschließlich A-Rows — B ist unsichtbar', async () => {
    const idA = await createComment(TENANT_A, 'Kommentar von Tenant A')
    const idB = await createComment(TENANT_B, 'Kommentar von Tenant B')

    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'comments',
      queries: scopeQueriesFor(TENANT_A, [
        Query.equal('targetId', TARGET.targetId),
        Query.equal('targetType', TARGET.targetType),
        Query.limit(100),
      ]),
    })
    const ids = rows.map(row => row.$id)
    expect(ids).toContain(idA)
    expect(ids).not.toContain(idB)
    expect(rows.every(row => (row as { tenantId?: string }).tenantId === TENANT_A.tenantId)).toBe(true)
  })

  it('Silo-Pfad (tenant null) bleibt ungefiltert — sieht beide (heutiges Verhalten)', async () => {
    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'comments',
      queries: scopeQueriesFor(null, [
        Query.equal('targetId', TARGET.targetId),
        Query.equal('targetType', TARGET.targetType),
        Query.limit(100),
      ]),
    })
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('ungestempelte Rows (Bestand, tenantId \'\') erscheinen in KEINEM Pool-Scope', async () => {
    const idLegacy = await createComment(null, 'Bestands-Kommentar ohne Tenant')
    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'comments',
      queries: scopeQueriesFor(TENANT_A, [
        Query.equal('targetId', TARGET.targetId),
        Query.equal('targetType', TARGET.targetType),
        Query.limit(100),
      ]),
    })
    expect(rows.map(row => row.$id)).not.toContain(idLegacy)
  })
})
