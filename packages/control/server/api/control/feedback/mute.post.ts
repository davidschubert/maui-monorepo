import { z } from 'zod'
import { feedbackActorSchema, feedbackActorFromService } from '../../../utils/customerFeedbackService'
import { setCommunityMuted } from '../../../utils/customerFeedback'

/**
 * Eine Community stummschalten (Entscheidung 8). Wie bei `update` bedient
 * dieselbe Funktion beide Gegenseiten; über die HTTP-Naht endet sie in 403,
 * weil dort niemand Betreiber ist.
 */
const bodySchema = feedbackActorSchema.extend({
  communityId: z.string().min(1).max(36),
  communityName: z.string().max(120).optional(),
  muted: z.boolean(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = await feedbackActorFromService(event, body)
  return await setCommunityMuted(event, actor, body)
})
