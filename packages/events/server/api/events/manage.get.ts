import { Query } from 'node-appwrite'
import { EVENTS_TABLE, type EventRow } from '../../../shared/types/event'

/**
 * Verwaltungs-Liste (dashboard/events): ALLE Status inkl. drafts — deshalb
 * Admin-Client (drafts tragen bewusst keine Read-Permission) hinter
 * events.manage.
 */
export default defineEventHandler(async (event): Promise<{ rows: EventRow[] }> => {
  requirePermission(event, 'events.manage')

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const res = await admin.tablesDB.listRows<EventRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: EVENTS_TABLE,
    queries: [Query.orderDesc('startAt'), Query.limit(100)],
  }).catch((error) => {
    throw toH3Error(error, 'Could not load events')
  })

  return { rows: res.rows }
})
