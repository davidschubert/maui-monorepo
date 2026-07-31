import { FEEDBACK_SERVICE_PATHS } from '../../../../control/shared/customerFeedback'
import { feedbackSubmitSchema } from '../../../../control/schemas/customerFeedback'
import { callFeedbackService, feedbackEnvelope } from '../../utils/feedbackGateway'

/**
 * Feedback senden — bewusst AUCH für Gäste (die Hürde soll minimal bleiben).
 * Spam-Schutz ist der Core-Rate-Limit-Bucket feedback:create (5/min/IP), die
 * Stummschaltung einer Community prüft das Control Plane.
 *
 * HIER wird schon validiert, obwohl das Control Plane es gleich nochmal tut:
 * eine kaputte Eingabe soll gar nicht erst über die Naht reisen, und der
 * Nutzer bekommt seinen Fehler von seinem eigenen Server (400), nicht als
 * durchgereichte Fremdantwort.
 */
export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, feedbackSubmitSchema.parse)
  const envelope = await feedbackEnvelope(event)

  const result = await callFeedbackService<{ id: string }>(event, FEEDBACK_SERVICE_PATHS.submit, {
    ...envelope,
    input,
  })

  setResponseStatus(event, 201)
  return { ok: true, ...result }
})
