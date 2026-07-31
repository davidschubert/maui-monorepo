import { FEEDBACK_SERVICE_PATHS } from '../../../../../control/shared/customerFeedback'
import { feedbackCommentSchema } from '../../../../../control/schemas/customerFeedback'
import { callFeedbackService, feedbackEnvelope } from '../../../utils/feedbackGateway'

/** Kommentar schreiben. Nur mit Login (Entscheidung 4). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'dashboard.access')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing feedback id' })

  const input = await readValidatedBody(event, feedbackCommentSchema.parse)
  const envelope = await feedbackEnvelope(event)

  setResponseStatus(event, 201)
  return await callFeedbackService<{ id: string, commentCount: number }>(
    event, FEEDBACK_SERVICE_PATHS.comment, { ...envelope, feedbackId: id, input },
  )
})
