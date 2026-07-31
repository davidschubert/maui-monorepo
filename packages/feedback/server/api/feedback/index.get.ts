import {
  FEEDBACK_SERVICE_PATHS,
  type FeedbackListResult,
} from '../../../../control/shared/customerFeedback'
import { callFeedbackService, feedbackEnvelope, feedbackServiceReachable } from '../../utils/feedbackGateway'

/**
 * Die Feedback-Liste DIESES Dashboards. Der Server holt sie beim Control
 * Plane; der Browser sieht nie ein fremdes Projekt (Entscheidung 1).
 *
 * SAUBER DEGRADIEREN, nicht mitreißen: ist die Naht nicht konfiguriert oder
 * control nicht erreichbar, kommt eine LEERE Liste mit `available: false`
 * zurück — die Seite zeigt dann einen Hinweis. Ein 503 an dieser Stelle würde
 * ein Dashboard, das sonst tadellos funktioniert, wegen eines fremden
 * Deployments unbrauchbar machen; genau das nennt der Plan als den Preis, den
 * man NICHT zahlen will.
 */
export default defineEventHandler(async (event): Promise<FeedbackListResult & { available: boolean }> => {
  requirePermission(event, 'dashboard.access')

  const empty = { total: 0, entries: [], operator: false, available: false }
  if (!feedbackServiceReachable(event)) return empty

  const query = getQuery(event)
  const envelope = await feedbackEnvelope(event)

  try {
    const result = await callFeedbackService<FeedbackListResult>(event, FEEDBACK_SERVICE_PATHS.list, {
      ...envelope,
      query: { sort: query.sort, state: query.state, page: query.page },
    })
    return { ...result, available: true }
  }
  catch (error) {
    const status = (error as { statusCode?: number, status?: number }).statusCode
      ?? (error as { status?: number }).status
    // 4xx ist eine Aussage über die Anfrage und gehört durchgereicht;
    // nur „control antwortet nicht" (5xx/503) wird zum stillen Leerzustand.
    if (typeof status === 'number' && status >= 400 && status < 500) throw error
    logEvent('warn', 'feedback.control_unavailable', { status: status ?? 0 })
    return empty
  }
})
