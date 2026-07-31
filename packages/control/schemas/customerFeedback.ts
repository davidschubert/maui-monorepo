import { z } from 'zod'
import {
  FEEDBACK_AREAS,
  FEEDBACK_SORTS,
  FEEDBACK_STATES,
  FEEDBACK_VISIBILITIES,
  MAX_FEEDBACK_COMMENT,
  MAX_FEEDBACK_MESSAGE,
  MAX_FEEDBACK_PAGE,
  MAX_FEEDBACK_TITLE,
} from '../shared/customerFeedback'

/**
 * Eingaben des zentralen Kunden-Feedbacks (E10). Als `create*Schema(t)`-
 * Factories, damit dieselbe Regel im Browser lokalisiert und auf dem Server
 * als Key-Fassung läuft (Projekt-Konvention).
 *
 * Die Schemas beschreiben NUR die Nutzlast. Wer handelt (Nutzer, Community,
 * Betreiber-Sicht) steht bewusst NICHT drin — das baut das Control Plane immer
 * selbst aus dem geprüften JWT bzw. der eigenen Session (siehe FeedbackActor).
 */

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/** Das Widget: Bereich, ggf. Produkt, Nachricht. */
export function createFeedbackSubmitSchema(t: TranslateFn = identity) {
  return z.object({
    area: z.enum(FEEDBACK_AREAS, t('feedback.validation.areaInvalid')),
    /**
     * Produkt-Key aus dem bestehenden Katalog (Entscheidung 5). Frei geformt
     * validiert (Kleinbuchstaben/Bindestrich) — die INHALTLICHE Prüfung gegen
     * den Katalog macht der Server, weil nur er ihn kennt.
     */
    productKey: z.string().trim().max(32).regex(/^[a-z0-9-]*$/, t('feedback.validation.productInvalid')).optional(),
    message: z.string().trim()
      .min(3, t('feedback.validation.messageRequired'))
      .max(MAX_FEEDBACK_MESSAGE, t('feedback.validation.messageMax')),
    /** Interner Pfad als Kontext — nur gespeichert, nie als Ziel benutzt. */
    page: z.string().trim().max(MAX_FEEDBACK_PAGE).optional(),
  }).refine(
    value => value.area !== 'product' || (value.productKey ?? '') !== '',
    { path: ['productKey'], message: t('feedback.validation.productRequired') },
  )
}

export const feedbackSubmitSchema = createFeedbackSubmitSchema()

/** Mitreden: ein Kommentar unter einem Eintrag. */
export function createFeedbackCommentSchema(t: TranslateFn = identity) {
  return z.object({
    body: z.string().trim()
      .min(2, t('feedback.validation.commentRequired'))
      .max(MAX_FEEDBACK_COMMENT, t('feedback.validation.commentMax')),
  })
}

export const feedbackCommentSchema = createFeedbackCommentSchema()

/** Liste: Sortierung + Zustands-Filter + Seite. */
export const feedbackQuerySchema = z.object({
  sort: z.enum(FEEDBACK_SORTS).default('trending'),
  /** '' = alle Zustände. */
  state: z.union([z.enum(FEEDBACK_STATES), z.literal('')]).default(''),
  page: z.coerce.number().int().min(1).max(400).default(1),
})

/**
 * Betreiber-Änderung. Jedes Feld ist OPTIONAL und „fehlt" heißt „nicht
 * angefasst" — dieselbe Betriebs-Begründung wie bei `neutral` im
 * Community-PATCH: control und die Runtime-Apps sind getrennte Deployments,
 * ein Pflichtfeld hieße 400 auf jede Aktion einer noch nicht aktualisierten
 * Gegenseite.
 */
export const feedbackUpdateSchema = z.object({
  state: z.enum(FEEDBACK_STATES).optional(),
  status: z.enum(FEEDBACK_VISIBILITIES).optional(),
  title: z.string().trim().min(1).max(MAX_FEEDBACK_TITLE).optional(),
  area: z.enum(FEEDBACK_AREAS).optional(),
  productKey: z.string().trim().max(32).regex(/^[a-z0-9-]*$/).optional(),
}).refine(
  value => Object.values(value).some(v => v !== undefined),
  { message: 'feedback.validation.nothingToUpdate' },
)
