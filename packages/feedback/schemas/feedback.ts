import { z } from 'zod'
import { FEEDBACK_CATEGORIES, MAX_FEEDBACK_MESSAGE } from '../shared/types/feedback'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

export function createFeedbackSchema(t: TranslateFn = identity) {
  return z.object({
    category: z.enum(FEEDBACK_CATEGORIES, t('feedback.validation.categoryInvalid')),
    message: z.string().trim()
      .min(3, t('feedback.validation.messageRequired'))
      .max(MAX_FEEDBACK_MESSAGE, t('feedback.validation.messageMax')),
    // interner Pfad als Kontext — kein Open-Redirect-Vektor (nur gespeichert)
    page: z.string().trim().max(300).optional(),
  })
}

// Server-seitige Instanz (Fehlertexte = Keys; die UI validiert mit t())
export const feedbackSchema = createFeedbackSchema()
