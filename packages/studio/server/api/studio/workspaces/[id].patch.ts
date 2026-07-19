import { z } from 'zod'
import { WORKSPACES_TABLE, type WorkspaceRow } from '../../../../shared/types/workspace'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  ownerEmail: z.string().trim().email().max(254).optional(),
}).strict()

/**
 * Workspace-Stammdaten ändern (sites.manage) — M8-T2. plan/status sind hier
 * BEWUSST nicht patchbar: die Autorität darüber ist der Billing-Fluss
 * (Checkout + Fulfillment, T3) — ein manueller Plan-Flip ohne Grant-Sync
 * würde Katalog und Sites auseinanderlaufen lassen.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing workspace id' })
  }
  const body = await readValidatedBody(event, patchSchema.parse)
  if (Object.keys(body).length === 0) {
    throw createError({ status: 422, statusText: 'Empty patch' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<WorkspaceRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WORKSPACES_TABLE,
    rowId: id,
    data: body,
  }).catch((error) => { throw toH3Error(error, 'Workspace not found') })

  return { id: row.$id, ...body }
})
