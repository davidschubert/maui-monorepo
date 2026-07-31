import { FEEDBACK_SERVICE_PATHS, type FeedbackServicePath } from '../../shared/customerFeedback'
import { feedbackActorFromSession } from '../utils/customerFeedbackService'
import {
  addFeedbackComment,
  eraseFeedbackUserData,
  exportFeedbackUserData,
  listFeedback,
  listFeedbackComments,
  setCommunityMuted,
  submitFeedback,
  toggleFeedbackVote,
  updateFeedback,
} from '../utils/customerFeedback'

/**
 * apps/control IST das Control Plane — hier meldet es sich als LOKALE
 * Gegenseite der Feedback-Naht an (registerFeedbackBackend im feedback-Layer,
 * gleiches Vertragsmuster wie registerSiteJoinHandler / registerTenantResolver).
 *
 * WARUM ÜBERHAUPT: nach Davids Entscheidung 1 fragt jedes Dashboard seinen
 * eigenen Server, der über die Service-Naht bei control nachfragt. Für das
 * BETREIBER-Dashboard wäre das ein HTTPS-Aufruf an sich selbst — mit Secret,
 * eigenem Timeout und einer zusätzlichen Fehlerquelle, für exakt null Gewinn.
 * Der Aufruf läuft deshalb in-process, durch DIESELBEN Funktionen wie die
 * Service-Routen. Es bleibt eine Wahrheit; nur der Transport entfällt.
 *
 * DER UNTERSCHIED IST DER ACTOR, und nur er: hier kommt er aus der eigenen
 * Session (`feedbackActorFromSession`) und trägt damit `isOperator`, wenn der
 * Angemeldete `feedback.manage` hat. Über die Naht ist er es NIE — das ist
 * Entscheidung 2 („Herkunft nur für den Betreiber"), und sie hängt an genau
 * dieser Zeile.
 *
 * Der feedback-Layer kennt control nicht (A14) — er kennt nur den Haken.
 */
export default defineNitroPlugin(() => {
  registerFeedbackBackend(async (event, path: FeedbackServicePath, body) => {
    const actor = feedbackActorFromSession(event)

    switch (path) {
      case FEEDBACK_SERVICE_PATHS.list:
        return await listFeedback(event, actor, body.query)
      case FEEDBACK_SERVICE_PATHS.submit:
        return await submitFeedback(event, actor, body.input)
      case FEEDBACK_SERVICE_PATHS.vote:
        return await toggleFeedbackVote(event, actor, String(body.feedbackId ?? ''))
      case FEEDBACK_SERVICE_PATHS.comments:
        return await listFeedbackComments(event, actor, String(body.feedbackId ?? ''))
      case FEEDBACK_SERVICE_PATHS.comment:
        return await addFeedbackComment(event, actor, String(body.feedbackId ?? ''), body.input)
      case FEEDBACK_SERVICE_PATHS.update:
        return await updateFeedback(event, actor, String(body.feedbackId ?? ''), body.patch)
      case FEEDBACK_SERVICE_PATHS.mute:
        return await setCommunityMuted(event, actor, {
          communityId: String(body.communityId ?? ''),
          communityName: typeof body.communityName === 'string' ? body.communityName : '',
          muted: body.muted === true,
        })
      case FEEDBACK_SERVICE_PATHS.userData:
        return await exportFeedbackUserData(event, String(body.projectId ?? ''), String(body.userId ?? ''))
      case FEEDBACK_SERVICE_PATHS.userErase:
        return await eraseFeedbackUserData(event, String(body.projectId ?? ''), String(body.userId ?? ''))
      default:
        // Fail-loud: ein neuer Pfad im Vertrag, der hier vergessen wurde, wäre
        // sonst ein stiller `undefined` in der Oberfläche.
        throw createError({ status: 500, statusText: `Unhandled feedback path: ${path}` })
    }
  })
})
