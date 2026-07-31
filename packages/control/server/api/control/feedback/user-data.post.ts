import { z } from 'zod'
import { exportFeedbackUserData } from '../../../utils/customerFeedback'

/**
 * DSGVO-AUSKUNFT über die Naht: die Runtime-App orchestriert den Export ihres
 * Nutzers, seine Feedback-Zeilen liegen aber hier.
 *
 * KEIN JWT: der Export läuft auch dann, wenn ein Betreiber ihn für ein Konto
 * anstößt, das sich nicht mehr anmelden kann — ein JWT zu verlangen hieße, die
 * Auskunft genau in dem Fall zu verweigern, in dem sie am häufigsten verlangt
 * wird. Der Gate ist das Service-Secret; gescopt wird hart auf das Paar
 * (projectId, userId), das der Aufrufer für SICH selbst nennt.
 */
const bodySchema = z.object({
  projectId: z.string().min(1).max(36),
  userId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  return await exportFeedbackUserData(event, body.projectId, body.userId)
})
