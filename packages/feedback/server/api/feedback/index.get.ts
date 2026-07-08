import { Query } from 'node-appwrite'
import { FEEDBACK_TABLE, type FeedbackListResponse, type FeedbackRow } from '../../../shared/types/feedback'

const PAGE_SIZE = 50

/** Feedback-Sichtung (feedback.manage): neueste zuerst, nach Status filterbar. */
export default defineEventHandler(async (event): Promise<FeedbackListResponse> => {
  requirePermission(event, 'feedback.manage')

  const query = getQuery(event)
  const status = query.status === 'open' || query.status === 'resolved' ? query.status : null
  const page = Math.max(1, Number(query.page ?? 1) || 1)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const res = await admin.tablesDB.listRows<FeedbackRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: FEEDBACK_TABLE,
    queries: [
      ...(status ? [Query.equal('status', status)] : []),
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_SIZE),
      Query.offset((page - 1) * PAGE_SIZE),
    ],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load feedback')
  })

  return { total: res.total, rows: res.rows }
})
