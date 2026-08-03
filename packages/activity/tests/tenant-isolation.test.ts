import { Client, ID, Query, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import { scopeQueriesFor, scopeRowFor, rowBelongsToTenant } from '../../core/server/utils/tenant'
import { tenantRowPermissionsFor } from '../../core/server/utils/tenantRowPermissions'
import type { TenantContext } from '../../core/shared/types/tenant'

/**
 * ISOLATIONSBEWEIS für `activities` (Arbeitsliste C1b) gegen eine ECHTE
 * Appwrite-Instanz — im Stil von comments/tests/tenant-isolation.test.ts.
 *
 * Der Feed hat ZWEI Wege nach draußen, beide werden geprüft:
 *  1. die Server-Route (Liste + Löschen per Id) → scopeQueriesFor /
 *     rowBelongsToTenant, also das, was tenantDb anhängt bzw. vor der Aktion
 *     belegt,
 *  2. der Realtime-Stream, der DIREKT gegen Appwrite liest → dort trägt die
 *     Row-Permission die Grenze (tenantRowPermissionsFor, im Pool
 *     Role.label(communityId) statt Role.users()).
 *
 * Env-gated wie der comments-Test: ohne Appwrite-Env skippt die Suite. Lokal:
 * Env der comments-App exportieren (set -a; source apps/comments/.env).
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

const stamp = Date.now()
const TENANT_A: TenantContext = { mode: 'pool', projectId: projectId ?? '', tenantId: `t-act-a-${stamp}`, communityId: `siteA${stamp}` }
const TENANT_B: TenantContext = { mode: 'pool', projectId: projectId ?? '', tenantId: `t-act-b-${stamp}`, communityId: `siteB${stamp}` }
/** Eigener objectType, damit der Test nur seine eigenen Zeilen sieht. */
const OBJECT_TYPE = `iso-${stamp}`.slice(0, 64)

describe.skipIf(!hasEnv)('Pool-Isolationsbeweis (echte Appwrite, activities.communityId)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []

  async function record(tenant: TenantContext | null, objectId: string): Promise<string> {
    const row = await tablesDB.createRow({
      databaseId: databaseId!,
      tableId: 'activities',
      rowId: ID.unique(),
      data: scopeRowFor(tenant, {
        actorId: 'activity-iso-test',
        actorName: 'Isolationstest',
        type: 'test.created',
        objectType: OBJECT_TYPE,
        objectId,
        link: '/',
        metadata: '',
        visibility: 'members',
      }),
      // Exakt das, was recordActivity() setzt
      permissions: tenantRowPermissionsFor(tenant, { read: 'members' }),
    })
    createdIds.push(row.$id)
    return row.$id
  }

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: 'activities', rowId: id }).catch(() => {})
    }
  })

  it('Mandant A sieht ausschließlich A-Einträge — B ist unsichtbar', async () => {
    const idA = await record(TENANT_A, 'obj-a')
    const idB = await record(TENANT_B, 'obj-b')

    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'activities',
      queries: scopeQueriesFor(TENANT_A, [Query.equal('objectType', OBJECT_TYPE), Query.limit(100)]),
    })
    const ids = rows.map(row => row.$id)
    expect(ids).toContain(idA)
    expect(ids).not.toContain(idB)
  })

  it('Löschen per Id trifft keinen fremden Eintrag (die Tür prüft vor der Aktion)', async () => {
    const idB = await record(TENANT_B, 'obj-b-byid')
    const foreign = await tablesDB.getRow({ databaseId: databaseId!, tableId: 'activities', rowId: idB })
    expect(rowBelongsToTenant(TENANT_A, foreign)).toBe(false)
    expect(rowBelongsToTenant(TENANT_B, foreign)).toBe(true)
  })

  it('Bestand ohne communityId erscheint in KEINEM Pool-Scope (fail-closed)', async () => {
    const idLegacy = await record(null, 'obj-legacy')
    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'activities',
      queries: scopeQueriesFor(TENANT_A, [Query.equal('objectType', OBJECT_TYPE), Query.limit(100)]),
    })
    expect(rows.map(row => row.$id)).not.toContain(idLegacy)
  })

  it('Realtime-Grenze: die Row trägt im Pool das SITE-Label, nicht Role.users()', async () => {
    const idA = await record(TENANT_A, 'obj-a-perms')
    const row = await tablesDB.getRow({ databaseId: databaseId!, tableId: 'activities', rowId: idA })
    // Ohne diese Permission bekäme JEDES eingeloggte Pool-Mitglied den Stream
    // aller Communities zugestellt (Realtime hängt an den Row-Rechten).
    expect(row.$permissions).toContain(`read("label:${TENANT_A.communityId}")`)
    expect(row.$permissions).not.toContain('read("users")')
  })

  it('Silo-Pfad (tenant null) bleibt ungefiltert und behält read("users")', async () => {
    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'activities',
      queries: scopeQueriesFor(null, [Query.equal('objectType', OBJECT_TYPE), Query.limit(100)]),
    })
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(tenantRowPermissionsFor(null, { read: 'members' })).toEqual(['read("users")'])
  })
})
