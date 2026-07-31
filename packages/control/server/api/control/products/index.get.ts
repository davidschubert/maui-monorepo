import { Query } from 'node-appwrite'
import { PRODUCT_CATALOG_TABLE, type ProductCatalogEntry, type ProductCatalogRow } from '../../../../shared/types/job'

/**
 * Produkt-Katalog (sites.manage) — repo-seitige Wahrheit, vom Job-Runner
 * gesynct (§ 8: der Web-Prozess liest NIE selbst Manifeste aus dem Repo).
 * Leer, solange `pnpm control:jobs` noch nie gelaufen ist — die UI zeigt
 * dann einen Hinweis statt des Pickers.
 */
export default defineEventHandler(async (event): Promise<{ products: ProductCatalogEntry[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const { rows } = await admin.tablesDB.listRows<ProductCatalogRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: PRODUCT_CATALOG_TABLE,
    queries: [Query.limit(100), Query.orderAsc('$id')],
  }).catch((error) => { throw toH3Error(error, 'Could not load product catalog') })

  return {
    products: rows.map(row => ({
      key: row.$id,
      tier: row.tier,
      requires: JSON.parse(row.requires || '[]') as string[],
      hasMigrations: row.hasMigrations,
      title: JSON.parse(row.title),
      description: JSON.parse(row.description),
      icon: row.icon,
    })),
  }
})
