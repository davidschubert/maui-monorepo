import { z } from 'zod'
import { SITES_TABLE, SITE_STATUSES, type SiteRow } from '../../../../shared/types/site'
import { WORKSPACES_TABLE } from '../../../../shared/types/workspace'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().regex(/^[a-z][a-z0-9-]*$/).max(64).optional(),
  appUrl: z.string().url().max(256).or(z.literal('')).optional(),
  status: z.enum(SITE_STATUSES).optional(),
  notes: z.string().max(1000).optional(),
  /** Workspace-Zuordnung (M8-T2); '' = Betreiber-Workspace (Zuordnung lösen). */
  workspaceId: z.string().max(36).optional(),
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

  // Zuordnung nur zu existierenden Workspaces — ein Tippfehler darf keine
  // Geister-Zuordnung erzeugen ('' löst die Zuordnung, keine Prüfung nötig)
  if (body.workspaceId) {
    await admin.tablesDB.getRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: WORKSPACES_TABLE,
      rowId: body.workspaceId,
    }).catch((error) => { throw toH3Error(error, 'Workspace not found') })
  }

  const row = await admin.tablesDB.updateRow<SiteRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: SITES_TABLE,
    rowId: id,
    data: body,
  }).catch((error) => { throw toH3Error(error, 'Site not found') })

  return { id: row.$id, ...body }
})
