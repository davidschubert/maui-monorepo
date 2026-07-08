import { z } from 'zod'
import { FEEDBACK_TABLE } from '../../../shared/types/feedback'

const patchSchema = z.object({ status: z.enum(['open', 'resolved']) })

/** Feedback erledigen/wieder öffnen (feedback.manage). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'feedback.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing feedback id' })
  }

  const { status } = await readValidatedBody(event, patchSchema.parse)
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  await admin.tablesDB.updateRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: FEEDBACK_TABLE,
    rowId: id,
    data: { status },
  }).catch((error) => {
    throw toH3Error(error, 'Could not update feedback')
  })

  return { ok: true }
})
