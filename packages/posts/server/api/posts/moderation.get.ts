import { Query } from 'node-appwrite'
import { POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Moderations-Sicht: jüngste Posts ALLER Status (published/hidden/scheduled —
 * deleted bleibt draußen, Soft-Delete gehört dem Autor) + offene Reports
 * über den generischen moderation-Vertrag (targetType 'post').
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'posts.moderate')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const res = await admin.tablesDB.listRows<CommunityPost>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: POSTS_TABLE,
    queries: [
      Query.equal('status', ['published', 'hidden', 'scheduled']),
      Query.orderDesc('$createdAt'),
      Query.limit(50),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not load posts') })

  const reports = await openReportsByTarget(event, 'post')

  return {
    rows: res.rows,
    reportCounts: Object.fromEntries(reports.counts),
  }
})
