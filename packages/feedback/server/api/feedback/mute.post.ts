import { z } from 'zod'
import { FEEDBACK_SERVICE_PATHS } from '../../../../control/shared/customerFeedback'
import { callFeedbackService, feedbackEnvelope, requireLocalFeedbackBackend } from '../../utils/feedbackGateway'

/**
 * Die dritte Notbremse aus Entscheidung 8: eine einzelne Community
 * stummschalten. Kein Löschen, kein Sperren des Kontos — nur „von hier kommt
 * vorerst nichts mehr". Aufheben ist derselbe Aufruf mit `muted: false`.
 */
const bodySchema = z.object({
  communityId: z.string().min(1).max(36),
  communityName: z.string().max(120).optional(),
  muted: z.boolean(),
})

export default defineEventHandler(async (event) => {
  requireLocalFeedbackBackend()
  requirePermission(event, 'feedback.manage')

  const body = await readValidatedBody(event, bodySchema.parse)
  const envelope = await feedbackEnvelope(event)

  return await callFeedbackService<{ muted: boolean }>(event, FEEDBACK_SERVICE_PATHS.mute, {
    ...envelope, ...body,
  })
})
