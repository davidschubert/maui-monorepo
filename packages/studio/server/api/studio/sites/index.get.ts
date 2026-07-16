import { Query } from 'node-appwrite'
import { SITES_TABLE, type SiteRow } from '../../../../shared/types/site'
import { ENTITLEMENTS_TABLE, type EntitlementRow } from '../../../../shared/types/entitlement'

/**
 * Sites-Register (sites.manage) — Statusübersicht des Control Plane,
 * inkl. der zugeteilten Features je Site (Entitlements, M6-T3).
 */
export default defineEventHandler(async (event): Promise<{ sites: (SiteRow & { entitlements: string[] })[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [sites, entitlements] = await Promise.all([
    admin.tablesDB.listRows<SiteRow>({
      databaseId, tableId: SITES_TABLE,
      queries: [Query.orderAsc('slug'), Query.limit(100)],
    }),
    admin.tablesDB.listRows<EntitlementRow>({
      databaseId, tableId: ENTITLEMENTS_TABLE,
      queries: [Query.equal('status', 'active'), Query.limit(1000)],
    }),
  ]).catch((error) => { throw toH3Error(error, 'Sites register missing — run migrations') })

  const bySite = new Map<string, string[]>()
  for (const row of entitlements.rows) {
    const list = bySite.get(row.siteProjectId) ?? []
    list.push(row.featureKey)
    bySite.set(row.siteProjectId, list)
  }

  return {
    sites: sites.rows.map(site => ({
      ...site,
      entitlements: (bySite.get(site.projectId) ?? []).sort(),
    })),
  }
})
