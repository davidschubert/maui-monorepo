import { ID } from 'node-appwrite'
import { z } from 'zod'
import { WORKSPACES_TABLE, type WorkspaceRow } from '../../../../shared/types/workspace'

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().email().max(254),
}).strict()

/**
 * Workspace anlegen (sites.manage) — M8-T2, v1 = reiner Betreiber-Vorgang
 * im Studio-Dashboard (Check-in: kein Self-Service, das ist M9). Start
 * immer im free-Plan; Plan-Wechsel läuft über Checkout + Fulfillment (T3).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const body = await readValidatedBody(event, createSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.createRow<WorkspaceRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: WORKSPACES_TABLE,
    rowId: ID.unique(),
    data: { name: body.name, ownerEmail: body.ownerEmail, stripeCustomerId: '', plan: 'free', status: 'active' },
  }).catch((error) => { throw toH3Error(error, 'Could not create workspace') })

  return { id: row.$id, name: row.name, ownerEmail: row.ownerEmail, plan: row.plan, status: row.status }
})
