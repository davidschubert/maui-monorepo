import { z } from 'zod'
import { feedbackActorSchema, feedbackActorFromService } from '../../../utils/customerFeedbackService'
import { listFeedbackComments } from '../../../utils/customerFeedback'

/** Die Kommentare eines Eintrags (Lesen, POST wegen des JWT im Body). */
const bodySchema = feedbackActorSchema.extend({
  feedbackId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = await feedbackActorFromService(event, body)
  return await listFeedbackComments(event, actor, body.feedbackId)
})
