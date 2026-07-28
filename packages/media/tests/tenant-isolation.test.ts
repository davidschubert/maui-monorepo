import { Client, ID, Query, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import { scopeQueriesFor, scopeRowFor, rowBelongsToTenant } from '../../core/server/utils/tenant'
import type { TenantContext } from '../../core/shared/types/tenant'

/**
 * ISOLATIONSBEWEIS für `media_items` (Arbeitsliste C1b) gegen eine ECHTE
 * Appwrite-Instanz — im Stil von comments/tests/tenant-isolation.test.ts.
 *
 * Bewiesen werden die drei Eigenschaften, an denen die Galerie im Pool hängt:
 *  1. die LISTE von Mandant A enthält keine Zeile von B (scopeQueriesFor —
 *     das, was tenantDb.list anhängt),
 *  2. der Zugriff PER ID auf eine fremde Zeile wird abgelehnt
 *     (rowBelongsToTenant — das, was tenantDb.get/update/remove prüft, bevor
 *     sie handeln; genau diese Prüfung fehlte am 2026-07-26 in drei Routen),
 *  3. Bestand ohne tenantId erscheint in KEINEM Pool-Scope (fail-closed).
 * Der Silo-Pfad (tenant null) bleibt ungefiltert = heutiges Verhalten von
 * photos und comments.
 *
 * Env-gated wie der comments-Test: ohne Appwrite-Env skippt die Suite. Lokal:
 * Env der photos-App exportieren (set -a; source apps/photos/.env).
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

const stamp = Date.now()
const TENANT_A: TenantContext = { mode: 'pool', projectId: projectId ?? '', tenantId: `t-media-a-${stamp}` }
const TENANT_B: TenantContext = { mode: 'pool', projectId: projectId ?? '', tenantId: `t-media-b-${stamp}` }
/** Eigener Titel-Marker, damit der Test nur seine eigenen Zeilen sieht. */
const MARKER = `media-iso-${stamp}`

describe.skipIf(!hasEnv)('Pool-Isolationsbeweis (echte Appwrite, media_items.tenantId)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []

  async function createItem(tenant: TenantContext | null, title: string): Promise<string> {
    const row = await tablesDB.createRow({
      databaseId: databaseId!,
      tableId: 'media_items',
      rowId: ID.unique(),
      data: scopeRowFor(tenant, {
        title,
        subtitle: MARKER,
        alt: '',
        // Keine echte Datei — der Test beweist die Zeilen-Grenze, nicht den Bucket
        fileId: `no-file-${ID.unique()}`,
        featured: false,
        published: true,
        sortOrder: 0,
      }),
    })
    createdIds.push(row.$id)
    return row.$id
  }

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: 'media_items', rowId: id }).catch(() => {})
    }
  })

  it('Mandant A sieht ausschließlich A-Zeilen — B ist unsichtbar', async () => {
    const idA = await createItem(TENANT_A, `${MARKER}-a`)
    const idB = await createItem(TENANT_B, `${MARKER}-b`)

    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'media_items',
      queries: scopeQueriesFor(TENANT_A, [Query.equal('subtitle', MARKER), Query.limit(100)]),
    })
    const ids = rows.map(row => row.$id)
    expect(ids).toContain(idA)
    expect(ids).not.toContain(idB)
    expect(rows.every(row => (row as { tenantId?: string }).tenantId === TENANT_A.tenantId)).toBe(true)
  })

  it('Zugriff PER ID auf eine fremde Zeile wird abgelehnt (die Tür prüft vor der Aktion)', async () => {
    const idB = await createItem(TENANT_B, `${MARKER}-b-byid`)
    // Der Admin-Client bekommt die Zeile — er umgeht Row-Permissions absichtlich.
    // Genau deshalb ist rowBelongsToTenant die Grenze, nicht die Row-Permission.
    const foreign = await tablesDB.getRow({ databaseId: databaseId!, tableId: 'media_items', rowId: idB })
    expect(rowBelongsToTenant(TENANT_A, foreign)).toBe(false)
    expect(rowBelongsToTenant(TENANT_B, foreign)).toBe(true)
  })

  it('Bestand ohne tenantId erscheint in KEINEM Pool-Scope (fail-closed)', async () => {
    const idLegacy = await createItem(null, `${MARKER}-legacy`)
    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'media_items',
      queries: scopeQueriesFor(TENANT_A, [Query.equal('subtitle', MARKER), Query.limit(100)]),
    })
    expect(rows.map(row => row.$id)).not.toContain(idLegacy)

    const legacy = await tablesDB.getRow({ databaseId: databaseId!, tableId: 'media_items', rowId: idLegacy })
    expect(rowBelongsToTenant(TENANT_A, legacy)).toBe(false)
  })

  it('Silo-Pfad (tenant null) bleibt ungefiltert — sieht alles (heutiges Verhalten)', async () => {
    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: 'media_items',
      queries: scopeQueriesFor(null, [Query.equal('subtitle', MARKER), Query.limit(100)]),
    })
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })
})
