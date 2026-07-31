import { z } from 'zod'
import { feedbackActorSchema, feedbackActorFromService } from '../../../utils/customerFeedbackService'
import { addFeedbackComment } from '../../../utils/customerFeedback'

/**
 * Mitreden. Nur mit Login (Entscheidung 4) — ein anonymer Kommentar wäre eine
 * Diskussion ohne Gegenüber und der bequemste Spam-Kanal, den man bauen kann.
 */
const bodySchema = feedbackActorSchema.extend({
  feedbackId: z.string().min(1).max(36),
  input: z.unknown(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = await feedbackActorFromService(event, body)
  setResponseStatus(event, 201)
  return await addFeedbackComment(event, actor, body.feedbackId, body.input)
})
