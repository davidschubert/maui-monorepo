import { ID } from 'node-appwrite'
import { embedSiteSchema } from '../../../../schemas/embedSite'
import { EMBED_SITES_TABLE, type EmbedSiteRow } from '../../../../shared/types/embedSite'
import { invalidateEmbedSitesCache } from '../../../utils/embedSites'

/** Betreiber: Einbetter-Site registrieren (E3) — Host landet in der
 *  frame-ancestors-CSP von /embed (Cache write-invalidiert, greift sofort).
 *  Doppelter Host → 409 via uq_host. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  const body = await readValidatedBody(event, embedSiteSchema.parse)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.createRow<EmbedSiteRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EMBED_SITES_TABLE,
    rowId: ID.unique(),
    data: {
      host: body.host,
      label: body.label ?? '',
      targetTypes: body.targetTypes ?? [],
      active: body.active ?? true,
    },
  }).catch((error) => { throw toH3Error(error, 'Could not create embed site') })

  invalidateEmbedSitesCache()
  return { id: row.$id, host: row.host, label: row.label, targetTypes: row.targetTypes ?? [], active: row.active !== false }
})
