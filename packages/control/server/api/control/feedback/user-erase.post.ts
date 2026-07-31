import { z } from 'zod'
import { eraseFeedbackUserData } from '../../../utils/customerFeedback'

/**
 * DSGVO-LÖSCHUNG über die Naht. „Löschen" heißt hier anonymisieren, wo fremder
 * Kontext dranhängt (Einträge mit Stimmen und Diskussion), und wirklich
 * löschen, wo keiner dranhängt (die Stimmen der Person selbst) — die
 * Begründung steht bei eraseFeedbackUserData.
 *
 * Protokolliert, weil das eine schreibende Fremd-Operation ist: wer sie
 * auslöst, ist per Secret unser eigenes Deployment, aber WELCHES Konto es
 * getroffen hat, gehört ins Log.
 */
const bodySchema = z.object({
  projectId: z.string().min(1).max(36),
  userId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const result = await eraseFeedbackUserData(event, body.projectId, body.userId)
  logEvent('info', 'feedback.user_erased', { projectId: body.projectId, userId: body.userId, ...result })
  return result
})
