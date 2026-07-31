import { Query } from 'node-appwrite'
import { z } from 'zod'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../shared/types/website'
import { PRODUCT_CATALOG_TABLE, type ProductCatalogRow } from '../../../../../shared/types/job'
import { replaceSiteGrants } from '../../../../utils/workspaceGrants'

const putSchema = z.object({
  products: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).max(20),
}).strict()

/**
 * Grant-Set einer Site ersetzen (sites.manage) — M6-T3, F3-Vorstufe:
 * fehlende Rows anlegen, nicht mehr gelistete löschen. Zuteilbar ist, was
 * der Produkt-Katalog kennt — außer core/system (implizit immer) und control
 * (läuft nur auf der Control-Site). Signatur/Zustellung an die Site folgt
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

  const site = await admin.tablesDB.getRow<WebsiteRow>({ databaseId, tableId: WEBSITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Site not found') })

  const { rows: catalog } = await admin.tablesDB.listRows<ProductCatalogRow>({
    databaseId, tableId: PRODUCT_CATALOG_TABLE, queries: [Query.limit(100)],
  }).catch((error) => { throw toH3Error(error, 'Could not load product catalog') })

  const NOT_GRANTABLE = ['core', 'system', 'control']
  const known = new Set(catalog.map(row => row.$id))
  for (const product of body.products) {
    if (!known.has(product) || NOT_GRANTABLE.includes(product)) {
      throw createError({ status: 400, statusText: `Unknown or non-grantable product: ${product}` })
    }
  }

  // Gemeinsame Ersetzen-Logik mit dem Workspace-Billing-Sync (M8-T3)
  await replaceSiteGrants(event, site.projectId, body.products)
    .catch((error) => { throw toH3Error(error, 'Could not update entitlements') })

  return { id, projectId: site.projectId, products: [...new Set(body.products)].sort() }
})
