import { Query } from 'node-appwrite'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../shared/types/website'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../../../shared/types/entitlement'

/**
 * Websites-Register (sites.manage) — Statusübersicht der eigenen Installationen
 * („Studio"-Seite des Dashboards), inkl. der zugeteilten Produkte je Website
 * (Entitlements, M6-T3).
 *
 * Die Capability heißt weiter `sites.manage`: sie deckt auch Communities und
 * Workspaces ab, ist also breiter als diese Tabelle — sie wird mit dem
 * Menü-Umbau (E9) neu geschnitten, nicht hier nebenbei.
 */
export default defineEventHandler(async (event): Promise<{ websites: (WebsiteRow & { entitlements: string[] })[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [websites, entitlements] = await Promise.all([
    admin.tablesDB.listRows<WebsiteRow>({
      databaseId, tableId: WEBSITES_TABLE,
      queries: [Query.orderAsc('slug'), Query.limit(100)],
    }),
    admin.tablesDB.listRows<EntitlementRow>({
      databaseId, tableId: ENTITLEMENTS_TABLE,
      queries: [Query.equal('status', 'active'), Query.limit(1000)],
    }),
  ]).catch((error) => { throw toH3Error(error, 'Websites register missing — run migrations') })

  // Entitlements hängen an der PROJEKT-Id der Website (F6-Identität), nicht an
  // ihrer Row-Id — deshalb der Umweg über eine Map statt eines Joins.
  const byProject = new Map<string, string[]>()
  for (const row of entitlements.rows) {
    const list = byProject.get(row.siteProjectId) ?? []
    list.push(row.productKey)
    byProject.set(row.siteProjectId, list)
  }

  return {
    websites: websites.rows.map(website => ({
      ...website,
      entitlements: (byProject.get(website.projectId) ?? []).sort(),
    })),
  }
})
