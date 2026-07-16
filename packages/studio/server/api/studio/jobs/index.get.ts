import { Query } from 'node-appwrite'
import { JOBS_TABLE, type JobRow } from '../../../../shared/types/job'

/** Provisionierungs-Jobs, neueste zuerst (sites.manage) — M6-T2. */
export default defineEventHandler(async (event): Promise<{ jobs: JobRow[] }> => {
  requirePermission(event, 'sites.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const { rows } = await admin.tablesDB.listRows<JobRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: JOBS_TABLE,
    queries: [Query.limit(25), Query.orderDesc('$createdAt')],
  }).catch((error) => { throw toH3Error(error, 'Could not load jobs') })

  return { jobs: rows }
})
