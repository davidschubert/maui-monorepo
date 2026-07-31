import { z } from 'zod'
import { feedbackActorSchema, feedbackActorFromService } from '../../../utils/customerFeedbackService'
import { toggleFeedbackVote } from '../../../utils/customerFeedback'

/**
 * Stimme setzen/zurücknehmen. EINE pro Person (Entscheidung 3) — die Regel
 * steht zusätzlich als Unique-Index in der Datenbank, weil zwei Tabs schneller
 * klicken als ein Server prüft.
 */
const bodySchema = feedbackActorSchema.extend({
  feedbackId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = await feedbackActorFromService(event, body)
  return await toggleFeedbackVote(event, actor, body.feedbackId)
})
