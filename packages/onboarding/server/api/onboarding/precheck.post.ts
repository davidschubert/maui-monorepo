import { z } from 'zod'
// Cross-Layer als expliziter Vertrag (s. site.post.ts).
import { inviteCodeSchema } from '../../../../control/schemas/onboarding'
import { createSlugSchema } from '../../../../control/schemas/tenant'
import { callControlPlane } from '../../utils/controlPlane'

/**
 * Live-Prüfung im Wizard: gilt der Code, ist die Adresse frei?
 *
 * Session Pflicht, obwohl hier nichts entsteht: sonst wäre das ein offener
 * Endpunkt, mit dem sich Einladungs-Codes durchprobieren und belegte
 * Subdomains abgrasen lassen. Zusätzlich drosselt die core-Rate-Limit-
 * Middleware pro IP.
 */
const bodySchema = z.object({
  code: inviteCodeSchema.optional(),
  slug: createSlugSchema().optional(),
}).strict().refine(body => body.code !== undefined || body.slug !== undefined, 'empty precheck')

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)
  const result = await callControlPlane<{ codeValid?: boolean, slugAvailable?: boolean }>(
    event,
    '/api/control/onboarding/precheck',
    // Die Adresse kommt aus der SESSION, nicht aus dem Body — sonst könnte
    // jemand die Bindung eines fremden Codes umgehen, indem er die Adresse
    // des Eingeladenen mitschickt.
    { ...body, email: event.context.user.email },
  )
  // Wird hier mitgeliefert, damit das UI den KI-Knopf (Schritt 4) nur zeigt,
  // wenn er auch funktioniert — der Wizard fragt diese Route ohnehin.
  return { ...result, aiAvailable: isAiAvailable(event) }
})
