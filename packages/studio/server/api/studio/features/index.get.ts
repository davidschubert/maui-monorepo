import { Query } from 'node-appwrite'
import { FEATURE_CATALOG_TABLE, type FeatureCatalogEntry, type FeatureCatalogRow } from '../../../../shared/types/job'

/**
 * Feature-Katalog (sites.manage) — repo-seitige Wahrheit, vom Job-Runner
 * gesynct (§ 8: der Web-Prozess liest NIE selbst Manifeste aus dem Repo).
 * Leer, solange `pnpm studio:jobs` noch nie gelaufen ist — die UI zeigt
 * dann einen Hinweis statt des Pickers.
 */
export default defineEventHandler(async (event): Promise<{ features: FeatureCatalogEntry[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const { rows } = await admin.tablesDB.listRows<FeatureCatalogRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: FEATURE_CATALOG_TABLE,
    queries: [Query.limit(100), Query.orderAsc('$id')],
  }).catch((error) => { throw toH3Error(error, 'Could not load feature catalog') })

  return {
    features: rows.map(row => ({
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
