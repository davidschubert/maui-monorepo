import { inviteCodePatchSchema } from '../../../../schemas/onboarding'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../../../shared/types/inviteCode'

/**
 * Betreiber: Code sperren oder wieder freigeben (sites.manage).
 *
 * Sperren ist nie destruktiv — die Row bleibt, damit die Spur erhalten bleibt,
 * mit welchem Code eine Community entstanden ist (tenants.inviteCodeId).
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing id' })
  const body = await readValidatedBody(event, inviteCodePatchSchema.parse)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.updateRow<InviteCodeRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_CODES_TABLE,
    rowId: id,
    data: { status: body.status },
  }).catch((error) => { throw toH3Error(error, 'Could not update invite code') })

  return { id: row.$id, status: row.status }
})
