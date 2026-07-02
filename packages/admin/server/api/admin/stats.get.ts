import { Query } from 'node-appwrite'
import type { AdminStats } from '../../../shared/types/admin'

/** Übersichts-Zahlen: Users-API total + TablesDB-Counts (limit 1, total zählt) */
export default defineEventHandler(async (event): Promise<AdminStats> => {
  requirePermission(event, 'dashboard.access')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const [users, comments, reportedTargets] = await Promise.all([
    admin.users.list({ queries: [Query.limit(1)] }),
    // Eine App mit admin-, aber ohne comments-Layer hat die Table nicht →
    // degradieren statt 500 im Dashboard.
    admin.tablesDB.listRows({ databaseId, tableId: 'comments', queries: [Query.limit(1)] })
      .catch(() => ({ total: 0 })),
    // Distinkte gemeldete Kommentare (offene Meldungen) — konsistent mit dem
    // Header der Moderations-Queue, der dieselbe Menge zählt (Moderation-Layer).
    openReportsByTarget(event, 'comment').catch(() => ({ order: [] as string[] })),
  ])

  return {
    usersTotal: users.total,
    commentsTotal: comments.total,
    commentsReported: reportedTargets.order.length,
  }
})
