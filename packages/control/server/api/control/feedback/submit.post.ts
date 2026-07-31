import { z } from 'zod'
import { feedbackActorSchema, feedbackActorFromService } from '../../../utils/customerFeedbackService'
import { submitFeedback } from '../../../utils/customerFeedback'

/**
 * Feedback einliefern — der eine Schreibweg von außen, und deshalb der, der
 * die Notbremsen trägt (Entscheidung 8): das Rate-Limit sitzt VOR dieser
 * Route in der Runtime-App (Bucket feedback:create), die Stummschaltung einer
 * Community prüft `submitFeedback` selbst.
 *
 * OHNE JWT ist der Absender wirklich anonym (Entscheidung 4) — keine Adresse,
 * keine Nachverfolgung, keine Kontaktmöglichkeit. Deshalb ist `jwt` optional
 * und nicht etwa Pflicht mit leerem Sonderwert: die Abwesenheit IST die Aussage.
 */
const bodySchema = feedbackActorSchema.extend({
  input: z.unknown(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = await feedbackActorFromService(event, body)
  const result = await submitFeedback(event, actor, body.input)
  setResponseStatus(event, 201)
  return result
})
