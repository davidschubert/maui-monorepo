import { Query } from 'node-appwrite'

/**
 * Kennzahlen des comments-Layers für die Dashboard-Übersicht (Stats-Vertrag,
 * CONCEPT A14) — Gesamtzahl + distinkte gemeldete Kommentare (offene Meldungen,
 * über den moderation-Vertrag openReportsByTarget; der targetType 'comment'
 * ist Konsumenten-Wissen und gehört deshalb HIERHER, nicht in den target-
 * agnostischen moderation-Layer). Degradiert still auf {}.
 */
export default defineNitroPlugin(() => {
  registerDashboardStatsContributor({
    id: 'comments',
    async collect(event) {
      const config = useRuntimeConfig(event)
      const admin = createAdminClient(event)
      const res = await admin.tablesDB.listRows({
        databaseId: config.public.appwriteDatabaseId,
        tableId: 'comments',
        queries: [Query.limit(1)],
      })
      const stats: Record<string, number> = { commentsTotal: res.total }
      try {
        const reported = await openReportsByTarget(event, 'comment')
        stats.commentsReported = reported.order.length
      }
      catch { /* moderation-Layer/reports-Tabelle nicht komponiert → Kennzahl entfällt */ }
      return stats
    },
  })
})
