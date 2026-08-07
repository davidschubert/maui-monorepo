import { z } from 'zod'
import { WEBSITES_TABLE, WEBSITE_STATUSES, type WebsiteRow } from '../../../../shared/types/website'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/).max(64).optional(),
  appUrl: z.string().url().max(256).or(z.literal('')).optional(),
  status: z.enum(WEBSITE_STATUSES).optional(),
  notes: z.string().max(1000).optional(),
  /**
   * Wo diese Site bei ploi wohnt (control-036). Reine Ziffern oder LEER —
   * leer heißt „nicht hinterlegt", und dann hält der Zertifikatsschritt einer
   * eigenen Domain ehrlich an, statt auf eine geratene Site zu schreiben.
   *
   * ALS DATEN UND NICHT ALS CODE, weil jedes Silo seine eigene ploi-Site hat
   * (portfolio 390041, comments 389772). Eine Zuordnung im Quelltext hieße,
   * dass jede neue Silo-Site ein Deployment kostet.
   *
   * Die Domain-Spalten selbst stehen BEWUSST NICHT hier: `customDomain` &
   * Co. gehören dem Ablauf (`/api/control/site/domain/*`), der sie zusammen
   * mit Token, DNS-Nachweis und Status setzt. Wären sie hier frei
   * beschreibbar, könnte ein Betreiber eine Domain per Hand auf `active`
   * setzen — ohne Nachweis, ohne Zertifikat, mit einer Umleitung ins Nichts.
   */
  ploiServerId: z.string().regex(/^\d{1,20}$/).or(z.literal('')).optional(),
  ploiSiteId: z.string().regex(/^\d{1,20}$/).or(z.literal('')).optional(),
}).strict()

/**
 * Register-Eintrag ändern (sites.manage). Slug ist veränderlich, die
 * Projekt-ID bewusst NICHT (unveränderliche Identität, F6). Status-Wechsel
 * hier = kaufmännischer Lifecycle (suspend/…) — technische Zustände
 * (provisioning/error) setzt später der Provisioner.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing site id' })
  }
  const body = await readValidatedBody(event, patchSchema.parse)
  if (Object.keys(body).length === 0) {
    throw createError({ status: 422, statusText: 'Empty patch' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.updateRow<WebsiteRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WEBSITES_TABLE,
    rowId: id,
    data: body,
  }).catch((error) => { throw toH3Error(error, 'Site not found') })

  return { id: row.$id, ...body }
})
