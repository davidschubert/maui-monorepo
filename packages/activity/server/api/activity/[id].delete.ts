import { ACTIVITIES_TABLE } from '../../../shared/types/activity'

/**
 * Einzelnen Feed-Eintrag löschen (Moderation). Admin-Client, weil die Rows
 * bewusst ohne User-delete-Permission entstehen (recordActivity) — die
 * Autorität ist die Capability, nicht eine Row-Permission.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'activity.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing activity id' })
  }

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  await tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: ACTIVITIES_TABLE,
    rowId: id,
  }).catch((error) => { throw toH3Error(error, 'Activity not found') })

  return { ok: true }
})
