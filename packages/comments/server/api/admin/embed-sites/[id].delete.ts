import { EMBED_SITES_TABLE } from '../../../../shared/types/embedSite'
import { invalidateEmbedSitesCache } from '../../../utils/embedSites'

/** Betreiber: Einbetter-Site löschen (E3) — fliegt sofort aus der CSP.
 *  WER HANDELT (F17): KEIN `actor` — Betriebs-Konfiguration hinter
 *  `requirePermission('system.manage')`, siehe index.post.ts. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing site id' })

  // Datentür als Operator — remove belegt die Zugehörigkeit (fremd → 404).
  await tenantDb(event, { as: 'operator' }).remove(EMBED_SITES_TABLE, id, 'Embed site not found')
    .catch((error) => { throw toH3Error(error, 'Could not delete embed site') })

  invalidateEmbedSitesCache()
  return { ok: true }
})
