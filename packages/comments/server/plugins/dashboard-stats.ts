import { Query } from 'node-appwrite'

/**
 * Kennzahl des comments-Layers für die Dashboard-Übersicht (Stats-Vertrag,
 * CONCEPT A14) — Gesamtzahl der Kommentare, degradiert still auf {}.
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
      return { commentsTotal: res.total }
    },
  })
})
