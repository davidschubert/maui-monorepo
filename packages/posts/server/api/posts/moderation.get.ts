import { Query } from 'node-appwrite'
import { POSTS_TABLE, type CommunityPost, type PostModerationResponse } from '../../../shared/types/post'

/**
 * Moderations-Sicht: jüngste Posts ALLER Status (published/hidden/scheduled —
 * deleted bleibt draußen, Soft-Delete gehört dem Autor) + offene Reports
 * über den generischen moderation-Vertrag (targetType 'post').
 */
export default defineEventHandler(async (event): Promise<PostModerationResponse> => {
  requirePermission(event, 'posts.moderate')

  // Datentür als Operator: Moderation sieht alle Status — aber nur die
  // Posts des EIGENEN Mandanten (der Admin-Client umgeht Row-Permissions,
  // die Tür ist hier die einzige Grenze).
  const res = await tenantDb(event, { as: 'operator' }).list<CommunityPost>(POSTS_TABLE, [
    Query.equal('status', ['published', 'hidden', 'scheduled']),
    Query.orderDesc('$createdAt'),
    Query.limit(50),
  ]).catch((error) => { throw toH3Error(error, 'Could not load posts') })

  const reports = await openReportsByTarget(event, 'post')

  return {
    rows: res.rows,
    reportCounts: Object.fromEntries(reports.counts),
    // UI zeigt den KI-Assist-Button nur, wenn der Core-KI-Pfad nutzbar ist
    aiAssist: isAiAvailable(event),
  }
})
