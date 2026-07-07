import { Query } from 'node-appwrite'
import { POSTS_TABLE, type CommunityPost } from '../../../shared/types/post'

/**
 * Eigene geplante Posts (Warteschlange, nächster Termin zuerst). Session-
 * Client: die Row-Security zeigt ohnehin nur eigene scheduled-Rows — der
 * authorId-Filter ist das explizite Sicherheitsnetz obendrauf.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createSessionClient(event)

  const res = await tablesDB.listRows<CommunityPost>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: POSTS_TABLE,
    queries: [
      Query.equal('status', 'scheduled'),
      Query.equal('authorId', user.$id),
      Query.orderAsc('scheduledAt'),
      Query.limit(25),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not load scheduled posts') })

  return { rows: res.rows }
})
