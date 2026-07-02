import { Query } from 'node-appwrite'
import type { AdminStats } from '../../../shared/types/admin'

/**
 * Übersichts-Zahlen: Users-API total + Kennzahlen der registrierten
 * DashboardStatsContributors (comments/moderation via Nitro-Plugin, CONCEPT
 * A14) — admin kennt keine Feature-Tabellen mehr; fehlende Layer liefern
 * schlicht keine Kennzahl (0-Default).
 */
export default defineEventHandler(async (event): Promise<AdminStats> => {
  requirePermission(event, 'dashboard.access')

  const admin = createAdminClient(event)

  const [users, stats] = await Promise.all([
    admin.users.list({ queries: [Query.limit(1)] }),
    collectDashboardStats(event),
  ])

  return {
    usersTotal: users.total,
    commentsTotal: stats.commentsTotal ?? 0,
    commentsReported: stats.commentsReported ?? 0,
  }
})
