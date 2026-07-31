import { FEEDBACK_SERVICE_PATHS } from '../../../../../control/shared/customerFeedback'
import { callFeedbackService, feedbackEnvelope } from '../../../utils/feedbackGateway'

/**
 * Wählen ist ein Umschalter: nochmal klicken nimmt die Stimme zurück. EINE
 * Stimme pro Person (Entscheidung 3) — „einfach und überall so erwartet";
 * gegen die Schlagseite großer Communities hilft die zweite Zahl („aus N
 * Communities"), nicht eine andere Rechnung.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'dashboard.access')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing feedback id' })

  const envelope = await feedbackEnvelope(event)
  return await callFeedbackService<{ voted: boolean, voteCount: number, communityCount: number }>(
    event, FEEDBACK_SERVICE_PATHS.vote, { ...envelope, feedbackId: id },
  )
})
