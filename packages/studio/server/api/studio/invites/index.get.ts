import { Query } from 'node-appwrite'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../../../shared/types/inviteCode'

/**
 * Betreiber: ausgestellte Einladungs-Codes (sites.manage).
 *
 * Der Hash wird bewusst NICHT mitgeliefert. Er ist zwar nicht umkehrbar, aber
 * er ist auch für nichts im UI nötig — und was nicht raus muss, geht nicht raus.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows, total } = await admin.tablesDB.listRows<InviteCodeRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_CODES_TABLE,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  })

  return {
    total,
    codes: rows.map(row => ({
      id: row.$id,
      label: row.label,
      maxUses: row.maxUses,
      uses: row.uses,
      expiresAt: row.expiresAt,
      status: row.status || 'active',
      createdAt: row.$createdAt,
    })),
  }
})
