import { FEEDBACK_SERVICE_PATHS, type FeedbackComment } from '../../../../../control/shared/customerFeedback'
import { callFeedbackService, feedbackEnvelope, feedbackServiceReachable } from '../../../utils/feedbackGateway'

/** Die Kommentare eines Eintrags — Mitreden gehört in JEDES Dashboard. */
export default defineEventHandler(async (event): Promise<{ comments: FeedbackComment[] }> => {
  requirePermission(event, 'dashboard.access')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing feedback id' })
  if (!feedbackServiceReachable(event)) return { comments: [] }

  const envelope = await feedbackEnvelope(event)
  return await callFeedbackService<{ comments: FeedbackComment[] }>(
    event, FEEDBACK_SERVICE_PATHS.comments, { ...envelope, feedbackId: id },
  )
})
