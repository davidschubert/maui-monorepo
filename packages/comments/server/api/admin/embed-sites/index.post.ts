import { embedSiteSchema } from '../../../../schemas/embedSite'
import { EMBED_SITES_TABLE, type EmbedSiteRow } from '../../../../shared/types/embedSite'
import { invalidateEmbedSitesCache } from '../../../utils/embedSites'

/** Betreiber: Einbetter-Site registrieren (E3) — Host landet in der
 *  frame-ancestors-CSP von /embed (Cache write-invalidiert, greift sofort).
 *  Doppelter Host → 409 via uq_host. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const body = await readValidatedBody(event, embedSiteSchema.parse)

  // Datentür als Operator: stempelt den Mandanten (Unique ist seit
  // comments-015 (tenantId, host) — derselbe Host darf in zwei Communities
  // registriert sein, aber nicht doppelt in einer).
  const row = await tenantDb(event, { as: 'operator' }).create<EmbedSiteRow>(EMBED_SITES_TABLE, {
    host: body.host,
    label: body.label ?? '',
    targetTypes: body.targetTypes ?? [],
    active: body.active ?? true,
  }).catch((error) => { throw toH3Error(error, 'Could not create embed site') })

  invalidateEmbedSitesCache()
  return { id: row.$id, host: row.host, label: row.label, targetTypes: row.targetTypes ?? [], active: row.active !== false }
})
