import { Query } from 'node-appwrite'
import type { AdminStats } from '../../../shared/types/admin'

/** Übersichts-Zahlen: Users-API total + TablesDB-Counts (limit 1, total zählt) */
export default defineEventHandler(async (event): Promise<AdminStats> => {
  requirePermission(event, 'dashboard.access')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [users, comments, reported] = await Promise.all([
    admin.users.list({ queries: [Query.limit(1)] }),
    admin.tablesDB.listRows({ databaseId, tableId: 'comments', queries: [Query.limit(1)] }),
    // Offene Meldungen kommen jetzt aus der reports-Tabelle (Moderation-Layer),
    // nicht mehr aus comment.status='reported'. Zählt offene Comment-Meldungen.
    admin.tablesDB.listRows({
      databaseId,
      tableId: REPORTS_TABLE,
      queries: [Query.equal('targetType', 'comment'), Query.equal('status', 'open'), Query.limit(1)],
    }),
  ])

  return {
    usersTotal: users.total,
    commentsTotal: comments.total,
    commentsReported: reported.total,
  }
})
