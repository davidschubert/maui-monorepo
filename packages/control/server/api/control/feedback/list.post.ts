import { z } from 'zod'
import type { FeedbackListResult } from '../../../../shared/customerFeedback'
import { feedbackActorSchema, feedbackActorFromService } from '../../../utils/customerFeedbackService'
import { listFeedback } from '../../../utils/customerFeedback'

/**
 * Die Liste — für ein Dashboard, das in einem ANDEREN Appwrite-Projekt läuft.
 *
 * POST für eine Leseabfrage ist hier richtig, nicht schlampig: die Naht trägt
 * das Appwrite-JWT IM BODY (nie in der URL — ein JWT in einer Query-Zeichenkette
 * landet in Logs und Referrern). Alle Routen dieser Naht sind deshalb POST;
 * dieselbe Begründung wie bei community/members/list.
 *
 * Was zurückkommt, entscheidet die Projektion (shared/customerFeedback.ts):
 * Text für alle, HERKUNFT nur für den Betreiber — und Betreiber kann über
 * diese Naht niemand sein.
 */
const bodySchema = feedbackActorSchema.extend({
  query: z.object({
    sort: z.string().optional(),
    state: z.string().optional(),
    page: z.union([z.number(), z.string()]).optional(),
  }).optional(),
}).strict()

export default defineEventHandler(async (event): Promise<FeedbackListResult> => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const actor = await feedbackActorFromService(event, body)
  return await listFeedback(event, actor, body.query ?? {})
})
