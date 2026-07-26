import { embedSitePatchSchema } from '../../../../schemas/embedSite'
import { EMBED_SITES_TABLE, type EmbedSiteRow } from '../../../../shared/types/embedSite'
import { invalidateEmbedSitesCache } from '../../../utils/embedSites'

/** Betreiber: Einbetter-Site ändern (Label/targetTypes/an-aus, E3). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing site id' })
  const body = await readValidatedBody(event, embedSitePatchSchema.parse)

  // Datentür als Operator — update belegt die Zugehörigkeit (fremd → 404).
  const row = await tenantDb(event, { as: 'operator' }).update<EmbedSiteRow>(EMBED_SITES_TABLE, id, {
      ...(body.host !== undefined ? { host: body.host } : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.targetTypes !== undefined ? { targetTypes: body.targetTypes } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
  }).catch((error) => { throw toH3Error(error, 'Could not update embed site') })

  invalidateEmbedSitesCache()
  return { id: row.$id, host: row.host, label: row.label, targetTypes: row.targetTypes ?? [], active: row.active !== false }
})
