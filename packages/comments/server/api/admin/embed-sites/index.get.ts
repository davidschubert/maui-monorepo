import { Query } from 'node-appwrite'
import { EMBED_SITES_TABLE, type EmbedSiteRow } from '../../../../shared/types/embedSite'

/** Betreiber: Einbetter-Registry auflisten (E3). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  // Datentür als Operator: im Pool sieht jede Community NUR ihr eigenes
  // Embed-Register (vorher teilten sich alle Tenants eines).
  const { rows, total } = await tenantDb(event, { as: 'operator' }).list<EmbedSiteRow>(EMBED_SITES_TABLE, [
    Query.orderAsc('host'),
    Query.limit(200),
  ]).catch((error) => { throw toH3Error(error, 'Could not list embed sites') })
  return { total, sites: rows.map(row => ({
    id: row.$id, host: row.host, label: row.label ?? '', targetTypes: row.targetTypes ?? [], active: row.active !== false,
  })) }
})
