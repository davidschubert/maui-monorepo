import { z } from 'zod'
import { feedbackActorSchema, feedbackActorFromService } from '../../../utils/customerFeedbackService'
import { updateFeedback } from '../../../utils/customerFeedback'

/**
 * Zustand verschieben / verstecken.
 *
 * WARUM DIE ROUTE TROTZDEM EXISTIERT, obwohl der Plan sagt, Betreiber gibt es
 * nur in apps/control: sie ist der EINE Einstiegspunkt, den auch die
 * In-Process-Gegenseite bedient (server/plugins/feedback-backend.ts ruft
 * dieselbe Funktion unter demselben Pfad). Über die HTTP-Naht endet sie
 * folgerichtig in 403 `operator_only` — `feedbackActorFromService` setzt
 * `isOperator` hart auf false. Das ist keine Attrappe, sondern die Regel aus
 * Entscheidung 2, an der Stelle durchgesetzt, an der jemand sie umgehen wollte.
 */
const bodySchema = feedbackActorSchema.extend({
  feedbackId: z.string().min(1).max(36),
  patch: z.unknown(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = await feedbackActorFromService(event, body)
  return await updateFeedback(event, actor, body.feedbackId, body.patch)
})
