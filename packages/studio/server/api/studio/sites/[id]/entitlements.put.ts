import { ID, Query } from 'node-appwrite'
import { z } from 'zod'
import { SITES_TABLE, type SiteRow } from '../../../../../shared/types/site'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../../../../shared/types/entitlement'
import { FEATURE_CATALOG_TABLE, type FeatureCatalogRow } from '../../../../../shared/types/job'

const putSchema = z.object({
  features: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).max(20),
}).strict()

/**
 * Grant-Set einer Site ersetzen (sites.manage) — M6-T3, F3-Vorstufe:
 * fehlende Rows anlegen, nicht mehr gelistete löschen. Zuteilbar ist, was
 * der Feature-Katalog kennt — außer core/system (implizit immer) und studio
 * (läuft nur auf der Studio-Site). Signatur/Zustellung an die Site folgt
 * in M8; bis dahin ist diese Table die manuell gepflegte Wahrheit.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing site id' })
  }

  const body = await readValidatedBody(event, putSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const site = await admin.tablesDB.getRow<SiteRow>({ databaseId, tableId: SITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Site not found') })

  const { rows: catalog } = await admin.tablesDB.listRows<FeatureCatalogRow>({
    databaseId, tableId: FEATURE_CATALOG_TABLE, queries: [Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not load feature catalog') })

  const NOT_GRANTABLE = ['core', 'system', 'studio']
  const known = new Set(catalog.map(row => row.$id))
  for (const feature of body.features) {
    if (!known.has(feature) || NOT_GRANTABLE.includes(feature)) {
      throw createError({ status: 400, statusText: `Unknown or non-grantable feature: ${feature}` })
    }
  }

  const { rows: existing } = await admin.tablesDB.listRows<EntitlementRow>({
    databaseId, tableId: ENTITLEMENTS_TABLE,
    queries: [Query.equal('siteProjectId', site.projectId), Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not load entitlements') })

  const wanted = new Set(body.features)
  const have = new Set(existing.map(row => row.featureKey))

  const operations: Promise<unknown>[] = []
  for (const feature of wanted) {
    if (!have.has(feature)) {
      operations.push(admin.tablesDB.createRow<EntitlementRow>({
        databaseId, tableId: ENTITLEMENTS_TABLE, rowId: ID.unique(),
        data: { siteProjectId: site.projectId, featureKey: feature, status: 'active', notes: '' },
      }))
    }
  }
  for (const row of existing) {
    if (!wanted.has(row.featureKey)) {
      operations.push(admin.tablesDB.deleteRow({ databaseId, tableId: ENTITLEMENTS_TABLE, rowId: row.$id }))
    }
  }
  await Promise.all(operations).catch((error) => { throw toH3Error(error, 'Could not update entitlements') })

  return { id, projectId: site.projectId, features: [...wanted].sort() }
})
