import { Query } from 'node-appwrite'
import { z } from 'zod'
import { SITES_TABLE, type SiteRow } from '../../../../../shared/types/site'
import { FEATURE_CATALOG_TABLE, type FeatureCatalogRow } from '../../../../../shared/types/job'
import { replaceSiteGrants } from '../../../../utils/workspaceGrants'

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

  // Gemeinsame Ersetzen-Logik mit dem Workspace-Billing-Sync (M8-T3)
  await replaceSiteGrants(event, site.projectId, body.features)
    .catch((error) => { throw toH3Error(error, 'Could not update entitlements') })

  return { id, projectId: site.projectId, features: [...new Set(body.features)].sort() }
})
