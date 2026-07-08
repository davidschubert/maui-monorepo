import { Query } from 'node-appwrite'
import { COURSES_TABLE, type CourseRow } from '../../../shared/types/course'

/** Builder-Liste (courses.manage): ALLE Status inkl. drafts. */
export default defineEventHandler(async (event): Promise<{ rows: CourseRow[] }> => {
  requirePermission(event, 'courses.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const res = await admin.tablesDB.listRows<CourseRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COURSES_TABLE,
    queries: [Query.orderDesc('$createdAt'), Query.limit(100)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load courses')
  })
  return { rows: res.rows }
})
