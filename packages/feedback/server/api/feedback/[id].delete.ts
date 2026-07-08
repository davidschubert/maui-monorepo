import { FEEDBACK_TABLE } from '../../../shared/types/feedback'

/** Feedback löschen (feedback.manage). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'feedback.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing feedback id' })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  await admin.tablesDB.deleteRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: FEEDBACK_TABLE,
    rowId: id,
  }).catch((error) => {
    throw toH3Error(error, 'Could not delete feedback')
  })

  return { ok: true }
})
