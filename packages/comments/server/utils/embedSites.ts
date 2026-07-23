import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { EMBED_SITES_TABLE, type EmbedSiteRow } from '../../shared/types/embedSite'
import type { EmbedSiteLike } from '../../shared/embedOrigins'

/**
 * E3 Site-Registry — gecachter Lesepfad: die CSP-Auflösung läuft auf JEDEM
 * /embed-Request, deshalb Microcache (60 s als Backstop; die Admin-Schreib-
 * routen invalidieren sofort → Registry-Änderungen greifen ohne Wartezeit).
 * Cross-Tenant-Cache-Regel: Key trägt den Tenant (Platform-Zukunft).
 */
const sitesCache = createMicrocache<EmbedSiteLike[]>(60_000)

export function invalidateEmbedSitesCache() {
  sitesCache.clear()
}

export async function listEmbedSites(event: H3Event): Promise<EmbedSiteLike[]> {
  const cacheKey = `sites:${tenantCacheScope(event)}`
  const cached = sitesCache.get(cacheKey)
  if (cached) return cached

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const { rows } = await tablesDB.listRows<EmbedSiteRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EMBED_SITES_TABLE,
    queries: [Query.limit(200)],
  })
  const sites = rows.map(row => ({
    host: row.host,
    targetTypes: row.targetTypes ?? [],
    active: row.active !== false,
  }))
  sitesCache.set(cacheKey, sites)
  return sites
}
