import { FEEDBACK_SERVICE_PATHS } from '../../../../control/shared/customerFeedback'
import { feedbackUpdateSchema } from '../../../../control/schemas/customerFeedback'
import { callFeedbackService, feedbackEnvelope, requireLocalFeedbackBackend } from '../../utils/feedbackGateway'

/**
 * Zustand verschieben / verstecken — „Verschieben ist Betreiber-Sache"
 * (Plan § Board-Zustände) und „verstecken statt löschen" (Entscheidung 8).
 *
 * Nur dort erreichbar, wo das Control Plane selbst läuft: über die Service-
 * Naht ist `isOperator` fest false, die Operation gibt es an anderen Orten
 * also nicht (404 statt einer Attrappe, die immer 403 sagt).
 */
export default defineEventHandler(async (event) => {
  requireLocalFeedbackBackend()
  requirePermission(event, 'feedback.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing feedback id' })

  const patch = await readValidatedBody(event, feedbackUpdateSchema.parse)
  const envelope = await feedbackEnvelope(event)

  return await callFeedbackService<{ ok: true }>(event, FEEDBACK_SERVICE_PATHS.update, {
    ...envelope, feedbackId: id, patch,
  })
})
