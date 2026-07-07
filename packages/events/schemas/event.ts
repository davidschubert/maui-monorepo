import { z } from 'zod'
import {
  MAX_EVENT_CAPACITY,
  MAX_EVENT_DESCRIPTION,
  MAX_EVENT_LOCATION,
  MAX_EVENT_TITLE,
  MAX_EVENT_URL,
  RSVP_STATUSES,
} from '../shared/types/event'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

const fields = (t: TranslateFn) => ({
  title: z.string().trim()
    .min(1, t('events.validation.titleRequired'))
    .max(MAX_EVENT_TITLE, t('events.validation.titleMax')),
  description: z.string().trim()
    .min(1, t('events.validation.descriptionRequired'))
    .max(MAX_EVENT_DESCRIPTION, t('events.validation.descriptionMax')),
  startAt: z.iso.datetime({ offset: true, error: t('events.validation.startRequired') }),
  endAt: z.iso.datetime({ offset: true }).nullish(),
  location: z.string().trim().max(MAX_EVENT_LOCATION, t('events.validation.locationMax')).nullish(),
  url: z.url(t('events.validation.urlInvalid')).max(MAX_EVENT_URL, t('events.validation.urlMax')).nullish(),
  capacity: z.number().int().min(1, t('events.validation.capacityMin'))
    .max(MAX_EVENT_CAPACITY, t('events.validation.capacityMax')).nullish(),
})

/** endAt (falls gesetzt) muss nach startAt liegen — für Create UND Edit */
function endAfterStart(data: { startAt?: string | null | undefined, endAt?: string | null | undefined }): boolean {
  return !data.startAt || !data.endAt || Date.parse(data.endAt) > Date.parse(data.startAt)
}

export function createEventSchema(t: TranslateFn = identity) {
  return z.object({
    ...fields(t),
    // direktes Publish beim Anlegen erlaubt; Default draft
    status: z.enum(['draft', 'published']).optional(),
  }).refine(endAfterStart, {
    message: t('events.validation.endBeforeStart'),
    path: ['endAt'],
  })
}

/**
 * PATCH: Teilfelder + Status-Übergang draft↔published (Publish).
 * 'cancelled' geht NUR über DELETE (Soft-Cancel) — bewusst nicht hier.
 */
export function createEventEditSchema(t: TranslateFn = identity) {
  const f = fields(t)
  return z.object({
    title: f.title.optional(),
    description: f.description.optional(),
    startAt: f.startAt.optional(),
    endAt: f.endAt,
    location: f.location,
    url: f.url,
    capacity: f.capacity,
    status: z.enum(['draft', 'published']).optional(),
  }).refine(endAfterStart, {
    message: t('events.validation.endBeforeStart'),
    path: ['endAt'],
  })
}

export function createRsvpSchema(t: TranslateFn = identity) {
  return z.object({
    status: z.enum(RSVP_STATUSES, t('events.validation.rsvpInvalid')),
  })
}

// Server-seitige Instanzen (Fehlertexte = Keys; die UI validiert mit t())
export const eventSchema = createEventSchema()
export const eventEditSchema = createEventEditSchema()
export const rsvpSchema = createRsvpSchema()
